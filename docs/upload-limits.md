# Upload Limits

File warehouse uploads are limited by `FILE_UPLOAD_LIMIT`.

- Default: `0`, which means the app layer does not enforce a file size limit.
- Set `FILE_UPLOAD_LIMIT` to a positive byte value when you want the app layer to reject larger uploads.
- Reverse proxies must allow at least the same request size. For Nginx, set `client_max_body_size 0;` for unlimited uploads, or set a sufficiently large positive value for the site that proxies this app.

Image host uploads continue to use `IMAGE_UPLOAD_LIMIT`.
