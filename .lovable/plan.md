

## Remove Landstar-Specific Terminology from Landing Page

### Overview
Replace all Landstar-specific references on the Landing page with generic owner-operator / trucking terminology. Also update the About page where Landstar is mentioned prominently.

### Changes

#### 1. `src/pages/Landing.tsx` — 10 text replacements

| Line | Current | Replacement |
|------|---------|-------------|
| 20 | `'Built for Landstar', value: '100%'` | `'Built for Truckers', value: '100%'` |
| 123 | `Built for Landstar BCOs & Agents` | `Built for Owner-Operators` |
| 130 | `...built specifically for Landstar BCOs to track expenses, manage card advances, and streamline dispatching.` | `...built specifically for owner-operators to track expenses, manage finances, and streamline dispatching.` |
| 138 | `Join Free BCO Beta` | `Join Free Beta` |
| 253 | `Solo BCO` | `Solo Operator` |
| 263 | `The Owner-Operator Pack` | (keep as-is) |
| 378 | `...how Landstar BCOs actually run their business.` | `...how owner-operators actually run their business.` |
| 382 | `Upload your Landstar settlement PDF...` | `Upload your settlement PDF...` |
| 408 | `Be among the first Landstar BCOs to experience...` | `Be among the first owner-operators to experience...` |
| 415 | `Join BCO Beta` | `Join Beta` |
| 433 | `...built for Landstar BCOs to track finances...` | `...built for owner-operators to track finances...` |
| 466 | `Built for Landstar BCOs & Agents` | `Built for Owner-Operators` |
| 477 | `Join BCO Beta` | `Join Beta` |

#### 2. `src/pages/About.tsx` — Minor adjustments

| Line | Current | Replacement |
|------|---------|-------------|
| 48 | `...leased to Landstar — a trucking company exclusively for Owner-Operators. Like many BCOs, he was...` | `...leased to a major carrier. Like many owner-operators, he was...` |
| 85 | `...we want as many BCOs as possible...` | `...we want as many owner-operators as possible...` |
| 100 | `Whether you're a solo BCO running one truck...` | `Whether you're a solo owner-operator running one truck...` |

