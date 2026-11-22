# Monitoring fixes
- [x] Replace infinite account bans and repair existing invalid bans; verified affected sign-in shows deactivation message.
- [x] Restore organization-relative Google Drive uploads without weakening tenant checks; 16 tests passed and deployed.
- [x] Verified real Drive upload, document readback and cleanup; Team invitation form opens; resolve only the two named findings.

# Statement PDF timeout
- [x] Replace buffered statement processing and timer races with streaming in both import entry points.
- [x] 32 tests passed; reader deployed; both real PDFs completed in the signed-in Finance review in 51 seconds without page errors. No expense import was confirmed.