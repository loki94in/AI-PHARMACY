# AI Camera Product Name Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a ProductNameFilterService that filters AI Camera OCR results to show only product names registered in the inventory, with optional internet fallback for missing products.

**Architecture:** 
- Keep existing AI Camera Service unchanged (SRP)
- Create new ProductNameFilterService handling fuzzy matching against cached medicine names
- Service loads medicine names from `medicines.name` table on initialization
- Optional internet fallback to external API when local matches insufficient
- Test script updated to use filtering service instead of displaying raw OCR text

**Tech Stack:**
- TypeScript, Node.js
- SQLite (existing medicines table)
- Fuzzy string matching (Levenshtein distance)
- Optional: axios or native fetch for internet API calls
- Jest for unit testing

---