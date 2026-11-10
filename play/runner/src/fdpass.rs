//! Handing a connected socket from the spawner to the proxy (SCM_RIGHTS).

use std::io;
use std::os::unix::io::{AsRawFd, FromRawFd, OwnedFd, RawFd};
use std::os::unix::net::UnixStream;

const FD_SIZE: usize = std::mem::size_of::<RawFd>();

/// Sends `data`, and `fd` with it when given, in one message.
pub fn send(sock: &UnixStream, data: &[u8], fd: Option<RawFd>) -> io::Result<()> {
    unsafe {
        let mut iov = libc::iovec {
            iov_base: data.as_ptr() as *mut libc::c_void,
            iov_len: data.len(),
        };
        let space = libc::CMSG_SPACE(FD_SIZE as u32) as usize;
        let mut cbuf = vec![0u8; space];
        let mut msg: libc::msghdr = std::mem::zeroed();
        msg.msg_iov = &mut iov;
        msg.msg_iovlen = 1;
        if let Some(fd) = fd {
            msg.msg_control = cbuf.as_mut_ptr() as *mut libc::c_void;
            msg.msg_controllen = space as _;
            let c = libc::CMSG_FIRSTHDR(&msg);
            (*c).cmsg_level = libc::SOL_SOCKET;
            (*c).cmsg_type = libc::SCM_RIGHTS;
            (*c).cmsg_len = libc::CMSG_LEN(FD_SIZE as u32) as _;
            std::ptr::copy_nonoverlapping(
                &fd as *const RawFd as *const u8,
                libc::CMSG_DATA(c),
                FD_SIZE,
            );
        }
        let mut sent = 0;
        while sent == 0 {
            let n = libc::sendmsg(sock.as_raw_fd(), &msg, 0);
            if n < 0 {
                let e = io::Error::last_os_error();
                if e.kind() == io::ErrorKind::Interrupted {
                    continue;
                }
                return Err(e);
            }
            sent = n as usize;
        }
        if sent < data.len() {
            // the fd went with the first part; the rest is plain bytes
            use std::io::Write;
            let mut s = sock;
            s.write_all(&data[sent..])?;
        }
        Ok(())
    }
}

/// Receives one message into `buf`, and the fd that came with it, if one did.
pub fn recv(sock: &UnixStream, buf: &mut [u8]) -> io::Result<(usize, Option<OwnedFd>)> {
    unsafe {
        let mut iov = libc::iovec {
            iov_base: buf.as_mut_ptr() as *mut libc::c_void,
            iov_len: buf.len(),
        };
        let space = libc::CMSG_SPACE((FD_SIZE * 4) as u32) as usize;
        let mut cbuf = vec![0u8; space];
        let mut msg: libc::msghdr = std::mem::zeroed();
        msg.msg_iov = &mut iov;
        msg.msg_iovlen = 1;
        msg.msg_control = cbuf.as_mut_ptr() as *mut libc::c_void;
        msg.msg_controllen = space as _;
        #[cfg(target_os = "linux")]
        let flags = libc::MSG_CMSG_CLOEXEC;
        #[cfg(not(target_os = "linux"))]
        let flags = 0;
        let n = loop {
            let n = libc::recvmsg(sock.as_raw_fd(), &mut msg, flags);
            if n < 0 {
                let e = io::Error::last_os_error();
                if e.kind() == io::ErrorKind::Interrupted {
                    continue;
                }
                return Err(e);
            }
            break n as usize;
        };
        let mut got: Option<OwnedFd> = None;
        let mut c = libc::CMSG_FIRSTHDR(&msg);
        while !c.is_null() {
            if (*c).cmsg_level == libc::SOL_SOCKET && (*c).cmsg_type == libc::SCM_RIGHTS {
                let data = libc::CMSG_DATA(c);
                let count = ((*c).cmsg_len as usize - libc::CMSG_LEN(0) as usize) / FD_SIZE;
                for i in 0..count {
                    let mut fd: RawFd = -1;
                    std::ptr::copy_nonoverlapping(
                        data.add(i * FD_SIZE),
                        &mut fd as *mut RawFd as *mut u8,
                        FD_SIZE,
                    );
                    let owned = OwnedFd::from_raw_fd(fd);
                    #[cfg(not(target_os = "linux"))]
                    libc::fcntl(fd, libc::F_SETFD, libc::FD_CLOEXEC);
                    // keep the first; any more are closed as they drop
                    if got.is_none() {
                        got = Some(owned);
                    }
                }
            }
            c = libc::CMSG_NXTHDR(&msg, c);
        }
        Ok((n, got))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    #[test]
    fn a_socket_crosses_over() {
        let (a, b) = UnixStream::pair().unwrap();
        let (mut x, y) = UnixStream::pair().unwrap();
        send(&a, b"{\"ok\":true}\n", Some(y.as_raw_fd())).unwrap();
        drop(y);
        let mut buf = [0u8; 64];
        let (n, fd) = recv(&b, &mut buf).unwrap();
        assert_eq!(&buf[..n], b"{\"ok\":true}\n");
        let mut y2 = UnixStream::from(fd.unwrap());
        x.write_all(b"ping").unwrap();
        let mut got = [0u8; 4];
        y2.read_exact(&mut got).unwrap();
        assert_eq!(&got, b"ping");
    }

    #[test]
    fn a_message_without_one() {
        let (a, b) = UnixStream::pair().unwrap();
        send(&a, b"{\"ok\":false}\n", None).unwrap();
        let mut buf = [0u8; 64];
        let (n, fd) = recv(&b, &mut buf).unwrap();
        assert_eq!(&buf[..n], b"{\"ok\":false}\n");
        assert!(fd.is_none());
    }
}
