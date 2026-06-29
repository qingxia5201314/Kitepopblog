# Upload Limits

File warehouse uploads are limited by `FILE_UPLOAD_LIMIT`.

- Default: `314572800` bytes, about 300 MB.
- Set `FILE_UPLOAD_LIMIT=0` only when you intentionally want the app layer to allow unlimited file upload size.
- Reverse proxies must allow at least the same request size. For Nginx, set `client_max_body_size 300m;` or a larger value for the site that proxies this app.

Image host uploads continue to use `IMAGE_UPLOAD_LIMIT`.
