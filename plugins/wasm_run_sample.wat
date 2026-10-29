;; Pricing rules a shop could let its partners write in any language that compiles to WebAssembly.
(module
  ;; The price in cents after a volume discount: 5% off from 10 items, 10% off from 50.
  (func (export "price") (param $unit i64) (param $qty i64) (result i64)
    (local $total i64)
    (local.set $total (i64.mul (local.get $unit) (local.get $qty)))
    (if (result i64) (i64.ge_s (local.get $qty) (i64.const 50))
      (then (i64.div_s (i64.mul (local.get $total) (i64.const 90)) (i64.const 100)))
      (else (if (result i64) (i64.ge_s (local.get $qty) (i64.const 10))
        (then (i64.div_s (i64.mul (local.get $total) (i64.const 95)) (i64.const 100)))
        (else (local.get $total))))))

  ;; Shipping in euros from a weight in kilograms.
  (func (export "shipping") (param $kg f64) (result f64)
    (f64.add (f64.const 4.5) (f64.mul (local.get $kg) (f64.const 1.25))))

  ;; A rule with a bug: it never ends. Fuel stops it.
  (func (export "forever") (result i32)
    (loop $again (br $again))
    (i32.const 0))

  (func (export "ratio") (param $a i32) (param $b i32) (result i32)
    (i32.div_s (local.get $a) (local.get $b))))
