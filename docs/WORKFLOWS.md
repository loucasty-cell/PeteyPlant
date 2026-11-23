# How Petey Plant works

[Back to the project](../README.md) · [Plant Pals gallery](images/petey-live-plant-pals.png) · [Model readiness](FLIGHT_READINESS_REPORT.md)

Petey has three everyday jobs. Help someone care for a plant they own, help them work out what they are seeing, and let them confirm a species before saving it. The diagrams follow the app and its offline model workflow.

## 01 · Care for a plant you own

```mermaid
flowchart TD
    OPEN(["Open a saved plant"]) --> CHECK["Report what the soil feels like"]
    CHECK --> STATE{"What does the check support?"}
    STATE -->|Fresh dry reading and verified setup| WATER["Show watering guidance"]
    STATE -->|Soil still moist| WAIT["Wait and estimate the next check"]
    STATE -->|Missing context| ASK["Ask for a soil or drainage check"]
    WATER --> LOG["Log watering when done"]
    LOG --> HISTORY[("Care history in SQLite")]
    WAIT --> HISTORY
    ASK --> HISTORY
    HISTORY --> PAL["Update the 3D companion's expression"]

    classDef start fill:#174233,stroke:#4b8a68,color:#fffaf0
    classDef decision fill:#f7df99,stroke:#9a661e,color:#302308
    classDef result fill:#daebdf,stroke:#518065,color:#163528
    class OPEN start
    class STATE decision
    class HISTORY,PAL result
```

The browser holds the key to its local garden. Next-check dates are estimates. Observation-led watering guidance currently covers Monstera and golden pothos, with confirmed pot drainage and a fresh soil report.

## 02 · Identify a plant with Petey Lens

```mermaid
flowchart TD
    PHOTO(["Take or choose a photo"]) --> REVIEW["Review the capture"]
    REVIEW --> READY{"Qualified photo matching available?"}
    READY -->|No| SEARCH["Search by plant name"]
    READY -->|Yes, user confirms upload| MODEL["Send a metadata-stripped image to Lens"]
    MODEL --> RESULT{"Is there a supported match?"}
    RESULT -->|Uncertain| RETAKE["Retake the photo or search by name"]
    RESULT -->|Possible matches| COMPARE["Compare leaf and stem traits"]
    SEARCH --> CONFIRM["Confirm a species or add an unknown plant"]
    RETAKE --> REVIEW
    COMPARE --> CONFIRM
    CONFIRM --> GARDEN[("Save the plant to your garden")]

    classDef start fill:#174233,stroke:#4b8a68,color:#fffaf0
    classDef decision fill:#f7df99,stroke:#9a661e,color:#302308
    classDef result fill:#daebdf,stroke:#518065,color:#163528
    class PHOTO start
    class READY,RESULT decision
    class CONFIRM,GARDEN result
```

The current build follows the manual lookup branch. If a matching model qualifies, its suggested species still needs your confirmation. The Lens service processes uploads in memory. It does not use them as training data.

## 03 · Work through a plant health concern

```mermaid
flowchart TD
    START(["Notice a change"]) --> NOTES["Choose the symptoms you can see"]
    NOTES --> CONTEXT["Report soil, drainage, light, pests and spread"]
    CONTEXT --> ENOUGH{"What would narrow it down?"}
    ENOUGH -->|Observation missing| INSPECT["Ask for a focused check"]
    ENOUGH -->|Useful next step| STEPS["Show possible causes and practical next steps"]
    ENOUGH -->|No visible issue reported| WATCH["Suggest what to watch for"]
    INSPECT --> SOURCES["Show care sources"]
    STEPS --> SOURCES
    WATCH --> SOURCES

    classDef start fill:#174233,stroke:#4b8a68,color:#fffaf0
    classDef decision fill:#f7df99,stroke:#9a661e,color:#302308
    classDef result fill:#daebdf,stroke:#518065,color:#163528
    class START start
    class ENOUGH decision
    class INSPECT,STEPS,WATCH result
```

Triage uses your observations and can give different next steps for similar-looking leaves. For example, wilting with unknown soil moisture calls for a soil check, while wilting with wet soil calls for holding off on watering and checking drainage. Triage observations are separate from saved garden records.

## 04 · Qualify a photo matching model

```mermaid
flowchart TD
    DATA(["Rights-reviewed indoor photos"]) --> AUDIT["Audit provenance, duplicates and plant groups"]
    AUDIT --> FREEZE["Freeze development and independent holdout splits"]
    FREEZE --> PROBE["Run grouped probe and held-source evaluation"]
    FREEZE --> CAL["Calibrate the species model on validation scores"]
    CAL --> HOLD["Score the frozen holdout"]
    HOLD --> REVIEW{"Evidence clears the gates?"}
    REVIEW -->|Species gates pass| ONNX["Load the pinned ONNX bundle"]
    REVIEW -->|Missing or below target| SEARCH["Keep manual species lookup"]
    PROBE --> FLIGHT["Record symptom and stress evidence"]
    HOLD --> FLIGHT
    FLIGHT --> REPORT["Generate JSON telemetry and readiness report"]

    classDef start fill:#174233,stroke:#4b8a68,color:#fffaf0
    classDef decision fill:#f7df99,stroke:#9a661e,color:#302308
    classDef result fill:#daebdf,stroke:#518065,color:#163528
    class DATA start
    class REVIEW decision
    class ONNX,SEARCH,REPORT result
```

The offline tools can audit photo manifests, run the grouped probe, score a local artifact, and generate readiness reports. The current status is **NO-GO** while independent indoor evaluation and a qualifying model are pending. See the [runtime contract](../backend/LENS.md), [offline commands](../backend/lens_pipeline/README.md), and [measured readiness results](FLIGHT_READINESS_REPORT.md).

## Where to find the implementation

| Area | Start here |
| --- | --- |
| Garden, Lens, Plant Health, and 3D companions | [Garden frontend](../frontend/src/components/garden/) |
| Saved plants and care history | [Garden service](../backend/services/garden.py) |
| Owner-observation triage | [Plant Health service](../backend/services/plant_health.py) |
| Photo matching and model loading | [Lens API](../backend/services/lens.py) and [ONNX adapter](../backend/services/lens_model.py) |
| Audits, evaluation, and readiness | [Offline pipeline](../backend/lens_pipeline/) |
| Browser checks | [Garden](../frontend/verification/garden.mjs) and [Lens and Plant Health](../frontend/verification/plant-tools.mjs) |
