# D013 · Deployed to cross-stitch.craftodejnice.cz from a public repository
Date: 2026-09-09 · Goal: G-001 · Status: active (superseded by: —)
Context: The Owner instructed a deploy after M9, replacing the earlier standalone, no-deploy framing.
Decision: Deploy with the portfolio's standard Docker and nginx recipe on port 30150, bound to 127.0.0.1, from a public GitHub repository.
Rejected: a private repository (the server clones over HTTPS without credentials, and adding credentials is a shared-infrastructure decision; Owner chose public); port 30130 (already taken by an undocumented container).
Consequence: A private repo would need real credential setup on the server. Ports are re-verified live before each deploy.
Evidence: COMPANY/INFRASTRUCTURE_DEPLOY.md; docker-compose.yml; HANDOVER.md D13 as of commit f7bb51c.
