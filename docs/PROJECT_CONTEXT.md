# PROJECT_CONTEXT.md

> High-level project context for AI coding assistants working on **PakCommerce AI**.
>
> This document intentionally focuses on **business context, product vision, domain knowledge, and architectural principles** rather than implementation details.
>
> Whenever implementing a feature, prioritize the principles in this document over assumptions.

---

# Project Overview

PakCommerce AI is an AI-powered ecommerce operations platform built specifically for Pakistani online sellers.

The platform connects existing ecommerce systems into one centralized workspace where sellers can manage products, inventory, orders, customers, conversations, courier information, and business insights.

PakCommerce AI is **not** another ecommerce platform or marketplace. Instead, it acts as an intelligent operational layer that sits above existing ecommerce systems and enhances them using AI.

---

# Vision

The vision of PakCommerce AI is to simplify ecommerce operations for Pakistani businesses by combining centralized business management with practical AI assistance.

Instead of switching between multiple dashboards every day, sellers should be able to manage their business from one place while AI assists both customers and sellers.

---

# Product Philosophy

PakCommerce AI is built around several fundamental ideas.

- AI should assist people, not replace them.
- The seller always remains in control.
- AI should work from real business data rather than assumptions.
- Recommendations should be explainable.
- Business operations should be transparent and auditable.
- Integrations should be modular and replaceable.
- The platform should be easy to extend without major redesign.

---

# Target Users

The primary users are Pakistani ecommerce sellers who operate one or more online stores.

Typical sellers may use:

- Shopify
- WooCommerce
- WhatsApp
- Facebook
- Instagram
- Local courier companies

Most sellers currently perform many repetitive tasks manually across multiple platforms.

PakCommerce AI aims to centralize these workflows.

---

# Problems Being Solved

PakCommerce AI exists to reduce common operational challenges faced by ecommerce sellers.

Examples include:

- fragmented business tools
- inventory inconsistencies
- duplicate manual work
- slow customer communication
- poor business visibility
- difficult order management
- inefficient courier selection
- lack of actionable business insights

The goal is to improve operational efficiency rather than replace existing ecommerce platforms.

---

# Core Domain

The platform revolves around the following business entities.

## Seller

The owner of a workspace.

Each seller has completely isolated business data.

---

## Workspace

The isolated environment where a seller manages their business.

Everything belongs to a workspace.

---

## Store

A connected ecommerce platform belonging to a seller.

A seller may connect multiple stores.

---

## Product

An item sold by the seller.

Products may exist across multiple connected stores.

---

## Inventory

The centralized stock state managed by PakCommerce AI.

Connected stores synchronize with this central inventory.

---

## Order

A purchase created by customers or synchronized from connected stores.

---

## Customer

A buyer with order history and conversation history.

---

## Conversation

Communication between customers and sellers.

Conversations may contain AI interactions.

---

## Courier

A delivery provider connected by the seller.

---

## AI Session

An interaction between either a customer or seller and one of the AI systems.

---

## Insight

A business observation generated from structured business data.

---

## Audit Event

A recorded system action for transparency and traceability.

---

# AI Experiences

PakCommerce AI contains two primary AI systems.

They serve different users but operate on the same centralized business platform.

---

## Buyer-Facing AI (WhatsApp Sales Agent)

The Buyer-Facing AI is the **WhatsApp Sales Agent**.

It communicates directly with customers on behalf of the seller.

Its responsibilities include:

- answering customer questions
- helping customers find products
- checking availability
- assisting product selection
- collecting order information
- creating draft orders
- answering store-related questions
- handing conversations to humans when required

The WhatsApp Sales Agent represents the seller but never replaces them.

It should always rely on real business data and avoid inventing information.

---

## Seller-Facing AI (Business Copilot)

The Seller-Facing AI is the **Business Copilot** available inside the seller dashboard.

Its responsibilities include:

- answering business questions
- explaining business performance
- summarizing operational data
- assisting with platform workflows
- recommending improvements
- helping sellers understand their business

The Business Copilot is an intelligent assistant, not an autonomous business manager.

---

# High-Level System

Conceptually the platform consists of several major areas.

- Seller Workspace
- Buyer Communication
- Business Management
- AI Assistance
- Integration Layer
- Analytics
- Shared Business Services

All components work together as one unified platform.

---

# Integration Philosophy

PakCommerce AI is integration-first.

External systems remain the source of ecommerce operations while PakCommerce AI coordinates and enhances those workflows.

The architecture should never assume only one provider exists.

New integrations should be easy to introduce without redesigning the system.

---

# Multi-Tenant Architecture

PakCommerce AI is a multi-tenant platform.

Every seller owns independent:

- stores
- products
- inventory
- customers
- conversations
- orders
- analytics
- AI history
- business settings

Tenant isolation must always be preserved.

---

# AI Philosophy

AI is an assistant built on top of structured business systems.

Whenever possible, AI should:

- retrieve current business data
- use backend tools
- explain conclusions
- avoid guessing
- avoid hallucinating
- remain grounded in business facts

LLMs should interpret data rather than generate business facts.

---

# Explainability

Whenever the system produces:

- recommendations
- scores
- insights
- summaries
- decisions

the seller should be able to understand **why**.

Explainability is a product feature, not an optional enhancement.

---

# Human-in-the-Loop

AI should never silently perform sensitive business operations.

Whenever confidence is low or an action has business impact, the seller should have the opportunity to review or approve it.

The seller always has final authority.

---

# Auditability

Important actions should be traceable.

The platform should make it possible to understand:

- what happened
- when it happened
- who initiated it
- whether AI was involved

Transparency is preferred over hidden automation.

---

# Scalability

The system should be designed so that future expansion is straightforward.

Possible future additions include:

- new ecommerce platforms
- additional courier providers
- more communication channels
- additional AI capabilities
- richer analytics
- workflow automation
- business integrations

The architecture should encourage extension instead of duplication.

---

# Development Principles

When implementing new functionality:

- Keep modules loosely coupled.
- Prefer reusable services.
- Keep business logic independent from UI.
- Keep integrations independent from business logic.
- Avoid hardcoding provider-specific assumptions.
- Design for maintainability.
- Design for extensibility.
- Prefer composition over duplication.

---

# Things That Must Always Be True

These are project invariants.

- Every resource belongs to exactly one seller.
- AI never invents business data.
- AI recommendations should be explainable.
- Inventory has one source of truth.
- Connected systems synchronize with the central platform.
- Sensitive actions require seller approval.
- AI should use tools whenever fresh business data is required.
- External providers are integrations, not business logic.
- Every integration should be replaceable.
- Important AI actions should be auditable.
- Business calculations belong in backend services rather than LLM prompts.
- AI should enhance seller productivity rather than remove seller control.

---

# How AI Should Think

Before implementing any feature, consider the following questions.

1. Which seller owns this?
2. Does this affect inventory?
3. Should this action be logged?
4. Should this require seller approval?
5. Does the AI need fresh business data?
6. Is this business logic or integration logic?
7. Can another provider replace this implementation later?
8. Will this scale to many sellers?
9. Does this preserve tenant isolation?
10. Does this make the platform easier to extend?

---

# Out of Scope

PakCommerce AI is **not**:

- an ecommerce marketplace
- an online shopping website
- a courier company
- a payment gateway
- an ERP replacement
- a chatbot demonstration
- a Shopify replacement
- a WooCommerce replacement
- a standalone AI application

It complements existing ecommerce ecosystems instead of replacing them.

---

# Overall Goal

PakCommerce AI combines two complementary AI experiences:

- **Buyer-Facing AI:** a WhatsApp Sales Agent that assists customers throughout the buying journey.
- **Seller-Facing AI:** a Business Copilot that helps sellers operate and understand their ecommerce business.

Both AI systems operate on top of the same centralized business platform, ensuring they always work with the same products, inventory, customers, orders, conversations, and business data.

Every feature added to the project should support one overarching objective:

> Help Pakistani ecommerce sellers operate their businesses more efficiently through centralized operations, practical AI assistance, explainable automation, and seamless integration with their existing ecommerce ecosystem.