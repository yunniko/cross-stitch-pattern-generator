# Jev moderation trial for G-111 (2026-10-08)

Can TypeSafe's Jev triage the comments and gallery descriptions G-111 will moderate? An offline trial:
nothing in the app calls Jev.

- **Cases:** 200 synthetic cases, hand-labelled (`scripts/jev-trial/moderation-cases.json`): 117 English and
  83 Czech; 146 comments under guide pages and 54 gallery descriptions; 125 allow, 31 review and 44 remove.
  105 are deliberately hard: craft slang ("frogging", "vypárat"), violent words aimed at tools, sarcasm, dark
  chart subjects, self-promotion, contact details, self-harm signals, prompt injection.
- **Questions:** four Nouls (spam, abusive, off_topic, personal_data) and one three-level Score
  (leave up / hold for a person / take down), all sent in one request per case. Script:
  `scripts/jev-trial/run-moderation-trial.mjs`. Raw answers: `scripts/jev-trial/moderation-answers.json`
  (`--score-only` recomputes everything below from them).
- **Model:** `jev-1.13.0`, called directly over HTTP.

## Results

**Cost and speed:** 155,633 input tokens, about $0.0065 for all 200 (≈ 780 tokens per case). Latency was
236 ms at the median, 275 ms at p90 and 464 ms at most, with four requests in flight.

**Action, taking the Score's most likely level:** 182 of 200 agree with the hand label (91%). English
was 91% and Czech 92%; the hard cases were 83%.

| hand \ Jev | allow | review | remove |
|---|---|---|---|
| allow | 122 | 3 | 0 |
| review | 7 | 18 | 6 |
| remove | 0 | 2 | 42 |

**No harmful case was left up and no harmless case was taken down.** Every disagreement is one step,
next to review.

**Confidence is meaningful:** cases with confidence ≥ 0.85 (148 of 200) agree 99% of the time. Below
0.5 (16 cases), agreement is 50%.

**Gated by confidence** (any answer below the gate goes to a person):

| gate | queue | remove → allow | allow → remove | review → allow |
|---|---|---|---|---|
| 0.6 | 40 | 0 | 0 | 4 |
| 0.7 | 48 | 0 | 0 | 2 |
| 0.85 | 57 | 0 | 0 | 1 |

**The Nouls rank well but don't separate cleanly at 0.5.** AUC is 0.995–0.999 for each flag. Their
false alarms are near-miss topics:
- `off_topic` fires on abuse and phishing;
- `spam` fires on people offering their own email for a swap;
- `personal_data` fires on spam that contains a contact address.

Use them as reasons shown to the moderator, not as triggers.

## Where Jev and the labels differ

- **Stricter than the labels on private details:** a third party's address and health, someone else's
  phone, posted credentials (c127, c128, c130, c134). Taking these down is defensible.
- **More lenient than the labels on subjects that need a policy:** nudity, political promotion, a rude
  gesture, a joke about a named ex-husband (c153, c155–c157, c168). The labels sent these to review
  because the Owner hasn't set a policy for them. A question can say so once the policy exists.
- **Cautious about distress:** both self-harm signals went to review, as labelled. Two sad but safe
  posts were held too (c163, c166).
- **Two misses on harm:** abuse aimed at another user's work (c106) and a threat in craft words
  (c122, abusive 0.18). Both went to review, not allow.

## Limits of this evidence

- The cases and labels are synthetic and were written by the same session that wrote the questions. The
  questions' wording echoes the label categories, so the 91% is an optimistic estimate. Real comments
  will be messier.
- There is one run and no held-out set. Confidence gates should be re-set on real reports once G-111 has
  content.
- It is text only: images in a gallery chart are not judged.
- Each case is sent to TypeSafe, an outside service. Real comments are personal data, so the provider's
  data terms need the Owner's review before G-111 sends any.

## Conclusion (JulAI)

Jev is good enough to plan G-111's triage on, as a **sorter in front of a person, not a judge.** Leave up
what it is confident is fine, and queue everything else for the admin with the Noul flags as reasons.
At the 0.7 gate that is 48 of 200 cases queued, and nothing harmful left up. Auto-removal needs real
data and the Owner's say first. The cost is negligible at any volume this site will see.
