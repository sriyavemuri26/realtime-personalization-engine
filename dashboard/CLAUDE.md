# Real-Time Personalization Engine Architecture

## Active Tech Stack
- **Frontend**: Next.js (App Router), TypeScript, Tailwind CSS, Recharts
- **Backend / Infra**: AWS Lambda (Python 3.11), DynamoDB, SQS, API Gateway, Terraform

## Collaboration Boundaries
1. **Interactive File Edits Allowed**: You may edit files directly across the workspace, but ALWAYS present the planned diffs and ask for my confirmation before saving or running terminal commands.
2. **Strict Scope Control**: Only edit files specified in the current step. Never refactor or touch working Live Demo code (`page.tsx`, `serving.py` feed logic) unless explicitly instructed.

## Core Rules & Invariants
1. **Live Demo Reference (CRITICAL)**: The "Live Demo" recommendation flow (`API Gateway -> ingest Lambda -> SQS -> processor Lambda -> DynamoDB user_profiles -> serving Lambda`) is working great. Use its implementation and behavior as the golden reference point when making architectural or scoring decisions. Do NOT break or refactor the working Live Demo logic.
2. **Scoring Logic Single Source of Truth**: The UCB1 + Category Affinity score formula MUST NOT drift across Lambdas or Frontend components.
3. **Behind the Scenes Tab Data Flow**: The analytics dashboard reflects real user interactions from the KuaiRand dataset, replayed through an offline EMA-based category-adaptation model (`scripts/simulate_kuairand_stream.py::calculate_online_telemetry`). This is a deliberately separate model from the Live Demo's UCB1 + affinity formula — they answer different questions (offline replay of real historical KuaiRand engagement vs. live exploration/exploitation over 10 synthetic demo categories) and are not required to share math. The tab is labeled "Offline KuaiRand Model Replay" to make this explicit rather than implying it's the same engine.
4. **No Dead Infra**: Only active DynamoDB tables (`user_profiles`, `kuairand_analytics`) and active S3 buckets (`data_lake`) should exist.