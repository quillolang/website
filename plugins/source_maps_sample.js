function a(n){let t=0;for(const o of n)t+=o.price*o.qty;return r(t)}function r(n){if(n<0)throw new Error("negative total");return n>100?n*.9:n}document.querySelector("#pay").addEventListener("click",()=>{console.log(a(window.cart))});
//# sourceMappingURL=source_maps_sample.js.map
