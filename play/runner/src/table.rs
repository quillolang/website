//! Who runs in which slot: one session per client, at most N runs an hour each, and
//! the slots themselves. Time is passed in, so the rules are tested without waiting.

use crate::log::Log;
use crate::util::ct_eq;
use std::collections::{HashMap, VecDeque};
use std::time::{Duration, Instant};

pub const HOUR: Duration = Duration::from_secs(3600);

#[derive(Debug)]
pub struct Session {
    pub token: String,
    pub client: String,
    /// The network the client is on, for the hourly limit and the cap on sessions at once.
    pub net: String,
    pub started: Instant,
    pub seen: Instant,
    pub log: Log,
    /// Its program is being started: no output read, no exit looked for, yet.
    pub starting: bool,
    /// The token of the link /run gave, and when it was made: it lets one browser in, once,
    /// within enter-ttl (review L4); the session's own token is never in a URL.
    pub enter: Option<(String, Instant)>,
}

#[derive(Debug)]
pub struct Ended {
    pub log: Log,
    pub exit: Option<i32>,
    pub at: Instant,
}

// One Begin a run, moved once: its size does not matter.
#[allow(clippy::large_enum_variant)]
#[derive(Debug)]
pub enum Begin {
    /// The slot taken, and the client's earlier session when this one took its place.
    Slot {
        slot: usize,
        replaced: Option<Session>,
    },
    Busy,
    TooMany,
    /// The client's network has `per_net` sessions already.
    NetFull,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Why {
    TooLong,
    Idle,
}

/// What an ended session costs beyond its output, against `ended_budget`.
pub const ENDED_OVERHEAD: usize = 256;

pub struct Table {
    pub slots: Vec<Option<Session>>,
    pub ended: HashMap<String, Ended>,
    runs: HashMap<String, VecDeque<Instant>>,
    runs_per_hour: usize,
    log_keep: usize,
    /// Ended sessions' output, all together, is kept under this (review M4): the oldest go.
    pub ended_budget: usize,
    /// Sessions at once from one network (an IPv6 /64) (second review, item 4).
    pub per_net: usize,
}

impl Table {
    pub fn new(slots: usize, runs_per_hour: usize, log_keep: usize) -> Table {
        Table {
            slots: (0..slots).map(|_| None).collect(),
            ended: HashMap::new(),
            runs: HashMap::new(),
            runs_per_hour,
            log_keep,
            ended_budget: 16 * 1024 * 1024,
            per_net: 3,
        }
    }

    /// A new run of `client` with `token`, its own network: see begin_in.
    pub fn begin(&mut self, client: &str, token: String, now: Instant) -> Begin {
        self.begin_in(client, client, token, now)
    }

    /// A new run of `client`, on network `net`, with `token`: the client's own slot (its
    /// earlier session is ended), else the first free one. The network may start
    /// `runs_per_hour` runs an hour, and have `per_net` sessions at once (a run that takes the
    /// place of the client's own is not one more).
    pub fn begin_in(&mut self, client: &str, net: &str, token: String, now: Instant) -> Begin {
        {
            let runs = self.runs.entry(net.to_string()).or_default();
            while runs.front().is_some_and(|t| now.duration_since(*t) >= HOUR) {
                runs.pop_front();
            }
            if runs.len() >= self.runs_per_hour {
                return Begin::TooMany;
            }
        }
        let own = self
            .slots
            .iter()
            .position(|s| s.as_ref().is_some_and(|s| s.client == client));
        if own.is_none()
            && self
                .slots
                .iter()
                .filter(|s| s.as_ref().is_some_and(|s| s.net == net))
                .count()
                >= self.per_net
        {
            return Begin::NetFull;
        }
        let slot = match own.or_else(|| self.slots.iter().position(|s| s.is_none())) {
            Some(i) => i,
            None => return Begin::Busy,
        };
        self.runs.entry(net.to_string()).or_default().push_back(now);
        let replaced = self.slots[slot].take();
        self.slots[slot] = Some(Session {
            token,
            client: client.to_string(),
            net: net.to_string(),
            started: now,
            seen: now,
            log: Log::new(self.log_keep),
            starting: true,
            enter: None,
        });
        Begin::Slot { slot, replaced }
    }

    /// The slot whose session has this token.
    pub fn by_token(&self, token: &str) -> Option<usize> {
        let mut found = None;
        for (i, s) in self.slots.iter().enumerate() {
            if let Some(s) = s {
                if ct_eq(s.token.as_bytes(), token.as_bytes()) {
                    found = Some(i);
                }
            }
        }
        found
    }

    pub fn token_of(&self, slot: usize) -> Option<&str> {
        self.slots.get(slot)?.as_ref().map(|s| s.token.as_str())
    }

    pub fn holds(&self, slot: usize, token: &str) -> bool {
        self.token_of(slot)
            .is_some_and(|t| ct_eq(t.as_bytes(), token.as_bytes()))
    }

    pub fn touch(&mut self, slot: usize, now: Instant) {
        if let Some(Some(s)) = self.slots.get_mut(slot) {
            s.seen = now;
        }
    }

    /// Ends the slot's session when it still has `token`: its output is kept for
    /// /log, with `note` after it, and the slot is free.
    pub fn end(
        &mut self,
        slot: usize,
        token: &str,
        exit: Option<i32>,
        note: Option<&str>,
        now: Instant,
    ) -> bool {
        if !self.holds(slot, token) {
            return false;
        }
        let s = self.slots[slot].take().unwrap();
        self.keep_ended(s, exit, note, now);
        true
    }

    pub fn keep_ended(
        &mut self,
        mut s: Session,
        exit: Option<i32>,
        note: Option<&str>,
        now: Instant,
    ) {
        s.log.finish();
        if let Some(n) = note {
            s.log.note(n);
        }
        self.ended.insert(
            s.token,
            Ended {
                log: s.log,
                exit,
                at: now,
            },
        );
        self.trim_ended();
    }

    /// Drops the oldest ended sessions until what they hold is within `ended_budget`.
    fn trim_ended(&mut self) {
        let mut total: usize = self
            .ended
            .values()
            .map(|e| e.log.cost() + ENDED_OVERHEAD)
            .sum();
        if total <= self.ended_budget {
            return;
        }
        let mut by_age: Vec<(Instant, String, usize)> = self
            .ended
            .iter()
            .map(|(k, e)| (e.at, k.clone(), e.log.cost() + ENDED_OVERHEAD))
            .collect();
        by_age.sort_by_key(|(at, _, _)| *at);
        for (_, k, cost) in by_age {
            if total <= self.ended_budget {
                break;
            }
            self.ended.remove(&k);
            total -= cost;
        }
    }

    /// Gives the slot's session (when it has `token`) the enter token `enter`.
    pub fn set_enter(&mut self, slot: usize, token: &str, enter: String, now: Instant) -> bool {
        if !self.holds(slot, token) {
            return false;
        }
        self.slots[slot].as_mut().unwrap().enter = Some((enter, now));
        true
    }

    /// Whether `given` is the slot's enter token, still young enough. `take`: it is used up.
    pub fn check_enter(
        &mut self,
        slot: usize,
        given: &str,
        now: Instant,
        ttl: Duration,
        take: bool,
    ) -> bool {
        let Some(Some(s)) = self.slots.get_mut(slot) else {
            return false;
        };
        let ok = s.enter.as_ref().is_some_and(|(e, at)| {
            ct_eq(e.as_bytes(), given.as_bytes()) && now.saturating_duration_since(*at) < ttl
        });
        if ok && take {
            s.enter = None;
        }
        ok
    }

    /// Sessions past their time: 10 minutes from the start, or 3 minutes unseen.
    pub fn expired(
        &self,
        now: Instant,
        max: Duration,
        idle: Duration,
    ) -> Vec<(usize, String, Why)> {
        let mut out = Vec::new();
        for (i, s) in self.slots.iter().enumerate() {
            if let Some(s) = s {
                if now.duration_since(s.started) >= max {
                    out.push((i, s.token.clone(), Why::TooLong));
                } else if now.duration_since(s.seen) >= idle {
                    out.push((i, s.token.clone(), Why::Idle));
                }
            }
        }
        out
    }

    /// Forgets ended sessions older than `keep`, and run counts older than an hour.
    pub fn prune(&mut self, now: Instant, keep: Duration) {
        self.ended.retain(|_, e| now.duration_since(e.at) < keep);
        self.runs.retain(|_, r| {
            while r.front().is_some_and(|t| now.duration_since(*t) >= HOUR) {
                r.pop_front();
            }
            !r.is_empty()
        });
    }

    pub fn busy(&self) -> usize {
        self.slots.iter().filter(|s| s.is_some()).count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tok(i: usize) -> String {
        format!("{:032x}", i)
    }

    #[test]
    fn one_session_per_client_in_its_own_slot() {
        let now = Instant::now();
        let mut t = Table::new(3, 30, 1024);
        let Begin::Slot {
            slot: a,
            replaced: None,
        } = t.begin("ip:1", tok(1), now)
        else {
            panic!()
        };
        let Begin::Slot {
            slot: b,
            replaced: None,
        } = t.begin("ip:2", tok(2), now)
        else {
            panic!()
        };
        assert_ne!(a, b);
        // the same client again: the same slot, the old session handed back
        let Begin::Slot {
            slot: a2,
            replaced: Some(old),
        } = t.begin("ip:1", tok(3), now)
        else {
            panic!()
        };
        assert_eq!(a2, a);
        assert_eq!(old.token, tok(1));
        assert_eq!(t.by_token(&tok(1)), None);
        assert_eq!(t.by_token(&tok(3)), Some(a));
        assert_eq!(t.busy(), 2);
    }

    #[test]
    fn busy_when_every_slot_is_taken() {
        let now = Instant::now();
        let mut t = Table::new(20, 30, 1024);
        for i in 0..20 {
            assert!(matches!(
                t.begin(&format!("ip:{}", i), tok(i), now),
                Begin::Slot { .. }
            ));
        }
        assert!(matches!(t.begin("ip:new", tok(99), now), Begin::Busy));
        // a client already in can still run again (its own slot)
        assert!(matches!(
            t.begin("ip:3", tok(100), now),
            Begin::Slot {
                replaced: Some(_),
                ..
            }
        ));
        // a busy answer is not counted as a run
        t.end(0, &tok(0), Some(0), None, now);
        assert!(matches!(
            t.begin("ip:new", tok(101), now),
            Begin::Slot { slot: 0, .. }
        ));
    }

    #[test]
    fn at_most_n_runs_an_hour() {
        let start = Instant::now();
        let mut t = Table::new(2, 30, 1024);
        for i in 0..30 {
            assert!(
                matches!(
                    t.begin("u1", tok(i), start + Duration::from_secs(i as u64)),
                    Begin::Slot { .. }
                ),
                "run {}",
                i
            );
        }
        assert!(matches!(
            t.begin("u1", tok(50), start + Duration::from_secs(60)),
            Begin::TooMany
        ));
        // another client is not held back
        assert!(matches!(
            t.begin("u2", tok(51), start + Duration::from_secs(60)),
            Begin::Slot { .. }
        ));
        // an hour after the first run, one more is allowed
        assert!(matches!(
            t.begin("u1", tok(52), start + HOUR),
            Begin::Slot { .. }
        ));
        assert!(matches!(
            t.begin("u1", tok(53), start + HOUR),
            Begin::TooMany
        ));
    }

    #[test]
    fn expiry_and_touch() {
        let start = Instant::now();
        let max = Duration::from_secs(600);
        let idle = Duration::from_secs(180);
        let mut t = Table::new(2, 30, 1024);
        t.begin("a", tok(1), start);
        t.begin("b", tok(2), start);
        assert!(t
            .expired(start + Duration::from_secs(179), max, idle)
            .is_empty());
        t.touch(0, start + Duration::from_secs(170));
        let e = t.expired(start + Duration::from_secs(181), max, idle);
        assert_eq!(e, vec![(1, tok(2), Why::Idle)]);
        // seen all along, still ended at 10 minutes
        for s in (0..600).step_by(60) {
            t.touch(0, start + Duration::from_secs(s));
        }
        let e = t.expired(start + max, max, idle);
        assert!(e.contains(&(0, tok(1), Why::TooLong)));
    }

    #[test]
    fn end_keeps_the_output_and_frees_the_slot() {
        let now = Instant::now();
        let mut t = Table::new(1, 30, 1024);
        t.begin("a", tok(1), now);
        t.slots[0].as_mut().unwrap().log.push(b"hello\npartial");
        assert!(
            !t.end(0, &tok(9), None, None, now),
            "another token ends nothing"
        );
        assert!(t.end(0, &tok(1), Some(3), Some("[ended]"), now));
        assert!(t.slots[0].is_none());
        let e = &t.ended[&tok(1)];
        assert_eq!(e.exit, Some(3));
        let lines: Vec<&str> = e.log.since(0, 1000).0.into_iter().map(|(_, l)| l).collect();
        assert_eq!(lines, vec!["hello", "partial", "[ended]"]);
        t.prune(now + Duration::from_secs(601), Duration::from_secs(600));
        assert!(t.ended.is_empty());
    }

    #[test]
    fn tokens_are_compared_whole() {
        let now = Instant::now();
        let mut t = Table::new(2, 30, 1024);
        t.begin("a", tok(1), now);
        assert_eq!(t.by_token(&tok(1)[..31]), None);
        assert_eq!(t.by_token(""), None);
        assert!(!t.holds(1, &tok(1)));
        assert!(!t.holds(7, &tok(1)));
    }

    #[test]
    fn the_enter_token_works_once_and_not_for_long() {
        let now = Instant::now();
        let ttl = Duration::from_secs(60);
        let mut t = Table::new(2, 30, 1024);
        t.begin("a", tok(1), now);
        assert!(!t.check_enter(0, &tok(7), now, ttl, false), "none made yet");
        assert!(!t.set_enter(0, &tok(9), tok(7), now), "only for the session's own token");
        assert!(t.set_enter(0, &tok(1), tok(7), now));
        assert!(!t.check_enter(0, &tok(1), now, ttl, false), "the session's token is not the enter token");
        assert!(!t.check_enter(0, &tok(7)[..31], now, ttl, false));
        assert!(!t.check_enter(1, &tok(7), now, ttl, false), "another slot");
        assert!(!t.check_enter(9, &tok(7), now, ttl, false), "no such slot");
        // looked at (the first step) as often as wanted, used (the second) once
        assert!(t.check_enter(0, &tok(7), now, ttl, false));
        assert!(t.check_enter(0, &tok(7), now + Duration::from_secs(59), ttl, false));
        assert!(t.check_enter(0, &tok(7), now + Duration::from_secs(1), ttl, true));
        assert!(!t.check_enter(0, &tok(7), now + Duration::from_secs(1), ttl, true), "used up");
        // too old
        t.set_enter(0, &tok(1), tok(8), now);
        assert!(!t.check_enter(0, &tok(8), now + ttl, ttl, true));
        // a new run of the client: a new session, no enter token from the old one
        t.set_enter(0, &tok(1), tok(8), now);
        t.begin("a", tok(2), now);
        assert!(!t.check_enter(0, &tok(8), now, ttl, false));
    }

    #[test]
    fn ended_sessions_are_held_to_a_budget_oldest_first() {
        let start = Instant::now();
        let mut t = Table::new(1, 1000, 64 * 1024);
        t.ended_budget = 3 * (8 * 1024 + 2 * 64 + ENDED_OVERHEAD);
        for i in 0..10 {
            let now = start + Duration::from_secs(i);
            t.begin("a", tok(i as usize), now);
            // two lines of 4 KB each
            t.slots[0].as_mut().unwrap().log.push(&vec![b'x'; 4096]);
            t.slots[0].as_mut().unwrap().log.push(b"\n");
            t.slots[0].as_mut().unwrap().log.push(&vec![b'y'; 4096]);
            t.end(0, &tok(i as usize), None, None, now);
            let total: usize = t.ended.values().map(|e| e.log.cost() + ENDED_OVERHEAD).sum();
            assert!(total <= t.ended_budget, "{} > {}", total, t.ended_budget);
        }
        assert!(t.ended.len() <= 3 && !t.ended.is_empty());
        assert!(t.ended.contains_key(&tok(9)), "the newest is kept");
        assert!(!t.ended.contains_key(&tok(0)), "the oldest went");
        // empty ended sessions still count their overhead: never without bound
        let mut t = Table::new(1, 1_000_000, 1024);
        t.ended_budget = 100 * ENDED_OVERHEAD;
        for i in 0..1000 {
            t.begin("b", tok(i), start);
            t.end(0, &tok(i), None, None, start + Duration::from_millis(i as u64));
        }
        assert!(t.ended.len() <= 100, "{}", t.ended.len());
    }

    #[test]
    fn a_network_shares_its_hourly_runs_and_has_at_most_three_sessions() {
        // second review, item 4: one session per address; the /64 counts runs and sessions
        let start = Instant::now();
        let mut t = Table::new(6, 5, 1024);
        let net = "ip6:2001:db8:1:2::/64";
        let ok = |b: &Begin| matches!(b, Begin::Slot { .. });
        // three people on one LAN: three sessions, none replacing another's
        for i in 1..=3 {
            let b = t.begin_in(&format!("ip:2001:db8:1:2::{}", i), net, tok(i), start);
            assert!(matches!(b, Begin::Slot { replaced: None, .. }), "{:?}", b);
        }
        assert_eq!(t.busy(), 3);
        // a fourth on it: too many from the network
        assert!(matches!(t.begin_in("ip:2001:db8:1:2::4", net, tok(4), start), Begin::NetFull));
        // one of the three runs again: its own session's place, not one more
        let b = t.begin_in("ip:2001:db8:1:2::2", net, tok(5), start);
        assert!(matches!(b, Begin::Slot { replaced: Some(_), .. }), "{:?}", b);
        assert_eq!(t.busy(), 3);
        // another network is not held back
        assert!(ok(&t.begin_in("ip:2001:db8:9:9::1", "ip6:2001:db8:9:9::/64", tok(6), start)));
        // the network's runs an hour are shared: 4 so far (NetFull was not counted), 1 left
        t.end(0, &tok(1), None, None, start);
        assert!(ok(&t.begin_in("ip:2001:db8:1:2::7", net, tok(7), start)));
        t.end(0, &tok(7), None, None, start);
        assert!(matches!(t.begin_in("ip:2001:db8:1:2::8", net, tok(8), start), Begin::TooMany));
        // an hour on, the network may run again
        assert!(ok(&t.begin_in("ip:2001:db8:1:2::8", net, tok(9), start + HOUR)));
        // a client on its own network (IPv4, an account): one session, as before
        let mut t = Table::new(3, 30, 1024);
        assert!(ok(&t.begin("ip:1.2.3.4", tok(1), start)));
        assert!(matches!(t.begin("ip:1.2.3.4", tok(2), start), Begin::Slot { replaced: Some(_), .. }));
        assert_eq!(t.busy(), 1);
    }
}
