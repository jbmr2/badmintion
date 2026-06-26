# Security Spec for Badminton Tournament Manager

## Data Invariants
1. A category cannot exist without a valid tournament ID.
2. A player cannot exist without a valid tournament ID.

## The "Dirty Dozen" Payloads (Examples)
1. Write Tournament without required fields.
2. Write Category without valid tournament ID.
3. Write Player with invalid tournament ID.
4. Update tournament name by unauthorized user.
... (etc)
