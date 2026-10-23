# Storage size and type limits (set by Lovable, not by the SQL file)

Lovable blocks SQL that edits `storage.buckets`, so the per-bucket size and file-type limits are a separate step.
The file-type rules that SQL *can* do are in `APPLY_SECURITY_FIXES.sql`. Size limits can only be set on the bucket.

Use Lovable's **Try to fix** on the two storage findings ("Anyone with an upload role can store unchecked files" and
"Completed-document upload accepts arbitrary unbounded bytes"). If it asks what to set, or if you would rather tell it
directly, paste this:

> Please set these storage bucket limits (file size limit and allowed file types) using your storage settings:
>
> | Bucket | Max file size | Allowed types |
> |---|---|---|
> | documents | 20 MB | PDF, JPEG, PNG, WebP, GIF, HEIC/HEIF, Word (.doc/.docx), Excel (.xls/.xlsx), CSV, plain text |
> | signed-documents | 15 MB | PDF, JPEG, PNG, WebP, HEIC/HEIF |
> | tax-documents | 15 MB | PDF, JPEG, PNG, WebP |
> | branding-assets | 2 MB | JPEG, PNG, WebP, GIF (no SVG) |
> | dvir-photos | 10 MB | JPEG, PNG, WebP, HEIC/HEIF |
> | dvir-signatures | 2 MB | JPEG, PNG |
> | beta-feedback and beta_feedback | 10 MB | JPEG, PNG, WebP, GIF, PDF |

The exact MIME types, if Lovable asks:
`application/pdf`, `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/heic`, `image/heif`,
`application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
`application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `text/csv`, `text/plain`.
