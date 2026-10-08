-- G-109: the quota reads one person's uses of one action in a rolling period.
CREATE INDEX "UsageEvent_userId_kind_createdAt_idx" ON "UsageEvent"("userId", "kind", "createdAt");
