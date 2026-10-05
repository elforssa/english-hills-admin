# Active architecture and operator contracts

Read [master architecture](../../ai/ARCHITECTURE.md) and [current evidence](../../ai/CURRENT_STATE.md) first. These documents supply current contract detail within the scopes below; dated implementation/approval announcements inside longer plans are historical. Presence here is not operational approval.

| Contract | Current authority / limit |
| --- | --- |
| [R4 lifecycle model](crm-meta-funnel-revision-4.md) | Five-event product/identity/order/prospective ownership contract, as amended by completed advisory-D2 and sharing-stop contracts. Implemented dormant; do not replay its implementation commission. |
| [H3 technical readiness](crm-h3-technical-readiness.md) | Provider manifest, transport/timestamp and H3-06/07/08 dormant-acceptance contract. Credential sections from older revisions are historical; S1 replaces them. |
| [S1 credential architecture](crm-meta-lifecycle-credential-simplification.md) | Sole current credential architecture and recovery/custody boundary. |
| [S1 Gate-B credential runbook](crm-h3-s1-gate-b-credential-runbook.md) | Sole current credential procedure; initial owner execution closed. Future recovery/replacement requires explicit authority. |
| [Lifecycle activation contract](crm-batch2-meta-lifecycle-activation.md) | Remaining H4 release prerequisites only where not superseded by R4, advisory D2, H3 or S1. Not the current credential or event-scope specification. |

## Operational references

[Intake scheduler](../../crm-intake-scheduler.md), [reconciliation](../../crm-meta-reconciliation.md), [website inquiry](../../crm-website-inquiries.md), [mapping policy](../../crm-mapping-learner-policy.md), [CRM operations](../../crm-operations-runbook.md), [Insights](../../crm-meta-insights.md) and [receipt model](../../receipt-financial-model.md) explain their respective contracts. Their dated rollout observations are not current deployment inventories. The old [Phase-10 lifecycle document](../../crm-meta-lifecycle.md) describes historical mock behavior; ADR-004/R4 and H3/S1 govern the current dormant live path.

## Completed and historical

- [Completed plans](completed) retain fulfilled implementation/release contracts, including still-binding advisory-D2/sharing-stop details and receptionist permission matrices.
- [CI tooling fast-path record](ci-tooling-fast-path.md) records adopted PR #90; current engineering policy is only in [AGENTS](../../../AGENTS.md). No Outcome-2 policy changes are made here.
- [Superseded credential plans](historical/README.md) are outside active authority; never replay consumed object-creation allowances or Rev7 credential ceremonies.
- [Historical index](../history/README.md) preserves the previous authority-document chronology and links evidence.

## Proposed receptionist workspace

[Outcome 3 — Receptionist CRM / Admissions Operating Workspace](outcome-3-receptionist-workspace.md), revision O3-r1, is the single proposed product/architecture contract. It awaits independent review and human owner approval; no implementation or Production operation is authorized.
