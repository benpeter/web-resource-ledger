# Decisions

- Measured first, on the rendered HTML of 17 complete staging battery
  captures: 14 had no lazy placeholders left. spiegel.de had 302 images
  still on lazysizes placeholders (an empty SVG `data:` URI in `src`, the
  image in `data-src`) plus 218 `<source data-srcset>`, and its screenshot
  showed blank boxes beside every teaser from about 2,000 CSS pixels down.
  samsung.com had 172, all thumbnails in closed navigation menus;
  hurriyet.com.tr 23.
- After the scroll, `fillLazyImages` (in the page) gives an image whose
  `src` is missing or a `data:` URI its `data-src` (`data-lazy-src`,
  `data-original`), and an image or a picture's `source` without a real
  `srcset` its `data-srcset`, which is what those libraries do once the image
  is in view. It replaces the old step that only handled `loading="lazy"`
  images.
- Only images inside the screenshot (above `screenshotHeightCap` for the
  viewport width) and visible (`checkVisibility` with opacity and
  visibility, and a box larger than 0 by 0) are filled. The first staging
  run filled 178 images on samsung.com, its closed menus' thumbnails, which
  are laid out but hidden; the visibility check came from that. A long page would otherwise load hundreds of images the
  screenshot doesn't show, against the 50 MB page cap and the Worker's
  memory (backlog #99).
- `render.lazyLoad` records `imagesFilled` and `scrollCutShort`: WRL changes
  attributes in the page before the screenshot, and the record says so. The
  scroll already had a wall-clock limit (10 s, `SCROLL_BUDGET_MS`, set in
  earlier phases instead of the roadmap's 5 s); `scrollCutShort` was only in
  the logs until now.
- No `render.spaDetected`: a framework marker (`__NEXT_DATA__`, `__NUXT__`)
  would not change what WRL does, and the settle step already waits for the
  network to go quiet. Left out until something would act on it.
