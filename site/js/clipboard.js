// tva
// Progressive enhancement: copy-to-clipboard for pre code blocks. CSP-safe (no inline handlers).
if (navigator.clipboard) {
  document.querySelectorAll('pre').forEach(function (pre) {
    var btn = document.createElement('button');
    btn.textContent = 'Copy';
    btn.className = 'copy-btn';
    btn.setAttribute('aria-label', 'Copy code to clipboard');
    pre.style.position = 'relative';
    pre.appendChild(btn);
    btn.addEventListener('click', function () {
      navigator.clipboard.writeText((pre.querySelector('code') || pre).textContent).then(function () {
        btn.textContent = 'Copied';
        btn.setAttribute('aria-label', 'Copied to clipboard');
        setTimeout(function () { btn.textContent = 'Copy'; btn.setAttribute('aria-label', 'Copy code to clipboard'); }, 2000);
      }).catch(function () { /* clipboard write failed — degrade silently */ });
    });
  });
}
