# Singapore Primary Mathematics Curriculum Data

This directory contains the committed, structured curriculum knowledge used by MathMagics for Primary 2 and Primary 3.

## Source policy

- **Curriculum truth:** Singapore Ministry of Education (MOE) Primary Mathematics syllabus for the 2021 cohort. MOE statements define what belongs to the curriculum.
- **Reference textbook mapping:** *Primary Mathematics*, 2022 Edition. Textbook chapters and lessons provide sequencing and teaching references only; they never override MOE curriculum truth.
- **Private source assets:** purchased books, scans, page photos, teacher-guide excerpts, and similar copyrighted source material belong under `/content-private/` and are never committed.
- **Provenance:** every committed curriculum record or textbook mapping must preserve a `sourceRefs` or source identifier that points back to `sources.json`. When derived metadata changes, its source locator must remain traceable.
- **Edition isolation:** Primary Mathematics editions are not interchangeable. A mapping attributed to the 2022 Edition must not be silently reused for U.S., Standards, Common Core, International, or other editions.

## Content layers

1. **Curriculum truth** — curriculum, levels, strands, topics, and Learning Objectives derived from MOE.
2. **Teaching knowledge** — prerequisites, CPA representations, problem-solving strategies, misconceptions, readiness evidence, and mastery evidence curated for MathMagics.
3. **Generated content** — lesson wording, examples, exercises, hints, and correction dialogue generated at runtime. Generated content is not stored here as curriculum truth.

## Textbook locators

Public publisher tables of contents may seed chapter and lesson mappings. Page numbers are included only when verified from an owned source. Unknown page ranges stay absent rather than being guessed.
