---
description: "Task list for 逶｣譟ｻ繝ｻ繧ｳ繝ｳ繝励Λ繧､繧｢繝ｳ繧ｹ蠑ｷ蛹・
---

# Tasks: 逶｣譟ｻ繝ｻ繧ｳ繝ｳ繝励Λ繧､繧｢繝ｳ繧ｹ蠑ｷ蛹・

**Input**: Design documents from `/specs/010-audit-compliance/`

**Prerequisites**: plan.md 笨・/ spec.md 笨・/ research.md 笨・/ data-model.md 笨・/ contracts/ 笨・/ quickstart.md 笨・

**Feature Branch**: `010-audit-compliance`

**Organization**: 繧ｿ繧ｹ繧ｯ縺ｯ繝ｦ繝ｼ繧ｶ繝ｼ繧ｹ繝医・繝ｪ繝ｼ・・S・牙腰菴阪〒繧ｰ繝ｫ繝ｼ繝怜喧縺輔ｌ縲∝推繧ｹ繝医・繝ｪ繝ｼ縺檎峡遶九＠縺ｦ螳溯｣・・繝・せ繝亥庄閭ｽ縺ｫ縺ｪ縺｣縺ｦ縺・ｋ縲・

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 荳ｦ蛻怜ｮ溯｡悟庄閭ｽ・育焚縺ｪ繧九ヵ繧｡繧､繝ｫ縲∵悴螳御ｺ・ち繧ｹ繧ｯ縺ｸ縺ｮ萓晏ｭ倥↑縺暦ｼ・
- **[Story]**: 蟇ｾ雎｡繝ｦ繝ｼ繧ｶ繝ｼ繧ｹ繝医・繝ｪ繝ｼ・・S1 / US2 / US3・・

---

## Phase 1: Setup・医・繝ｭ繧ｸ繧ｧ繧ｯ繝亥・譛溷喧・・

**Purpose**: `AUDIT_HMAC_SECRET` 迺ｰ蠅・､画焚縺ｮ襍ｷ蜍輔メ繧ｧ繝・け縺ｨ scripts/ 繝・ぅ繝ｬ繧ｯ繝医Μ縺ｮ貅門ｙ

- [X] T001 `AUDIT_HMAC_SECRET` 迺ｰ蠅・､画焚繝舌Μ繝・・繧ｷ繝ｧ繝ｳ繧・`src/index.ts` 縺ｮ襍ｷ蜍募・逅・↓霑ｽ蜉縺吶ｋ・域悴險ｭ螳壹∪縺溘・32譁・ｭ玲悴貅縺ｮ蝣ｴ蜷・`process.exit(1)` 縺励√お繝ｩ繝ｼ繝｡繝・そ繝ｼ繧ｸ繧定｡ｨ遉ｺ縺吶ｋ FR-007・・
- [X] T002 [P] `scripts/` 繝・ぅ繝ｬ繧ｯ繝医Μ繧剃ｽ懈・縺励ゝypeScript CLI 繝輔ぃ繧､繝ｫ繧貞ｮ溯｡後☆繧・`tsconfig` 縺翫ｈ縺ｳ `package.json` 繧ｹ繧ｯ繝ｪ繝励ヨ縺ｮ險ｭ螳壹ｒ遒ｺ隱阪・霑ｽ蜉縺吶ｋ

---

## Phase 2: Foundational・亥・繝ｦ繝ｼ繧ｶ繝ｼ繧ｹ繝医・繝ｪ繝ｼ縺ｮ蜑肴署・・

**Purpose**: 縺吶∋縺ｦ縺ｮ US 縺御ｾ晏ｭ倥☆繧九さ繧｢縺ｮ蝙句ｮ夂ｾｩ繝ｻ險ｭ螳壹せ繧ｭ繝ｼ繝槭・證怜捷蛹悶Δ繧ｸ繝･繝ｼ繝ｫ

**笞・・CRITICAL**: 縺薙・繝輔ぉ繝ｼ繧ｺ縺悟ｮ御ｺ・☆繧九∪縺ｧ US 螳溯｣・ｒ髢句ｧ九＠縺ｦ縺ｯ縺ｪ繧峨↑縺・

- [X] T003 [P] `src/types/index.ts` 縺ｮ `AuditLogEntry` 蝙九ｒ諡｡蠑ｵ縺吶ｋ・・prevHash: string`縲～currHash: string`縲～redactedIdentifierHash?`縲～redactedCount?`縲～redactedAt?` 繧定ｿｽ蜉縺励～AuditEvent` 縺ｫ `'redaction'` 繧定ｿｽ蜉縺吶ｋ data-model.md ﾂｧ1・・
- [X] T004 [P] `src/config/schema.ts` 縺ｮ `ConfigSchema` 縺ｫ `logRetention` Zod 繧ｹ繧ｭ繝ｼ繝槭ｒ霑ｽ蜉縺吶ｋ・・retentionDays: z.number().int().min(0).default(365)`縲～maxLogSizeMB: z.number().int().min(1).max(1000).default(10)` data-model.md ﾂｧ2・・
- [X] T005 `src/logger/integrity.ts` 繧呈眠隕丈ｽ懈・縺吶ｋ・・node:crypto` HMAC-SHA256 縺ｫ繧医ｋ繝√ぉ繝ｼ繝ｳ繝上ャ繧ｷ繝･險育ｮ・`computeHmac(entry, prevHash, secret): string`縲√メ繧ｧ繝ｼ繝ｳ讀懆ｨｼ `verifyChain(entries, secret): VerificationResult` 繧貞ｮ溯｣・☆繧九５003 螳御ｺ・ｾ後↓逹謇・research.md ﾂｧ1・・

**Checkpoint**: 蝙九・險ｭ螳壹・證怜捷繝｢繧ｸ繝･繝ｼ繝ｫ縺梧紛縺｣縺・窶・US 螳溯｣・ｒ荳ｦ蛻鈴幕蟋句庄閭ｽ

---

## Phase 3: User Story 1 - 逶｣譟ｻ繝ｭ繧ｰ縺ｮ謾ｹ縺悶ｓ讀懃衍・・1・解沁ｯ MVP

**Goal**: 蜷・Ο繧ｰ繧ｨ繝ｳ繝医Μ縺ｫ HMAC 繝√ぉ繝ｼ繝ｳ繧剃ｻ倅ｸ弱＠縲∵焔蜍・CLI 縺ｧ謾ｹ縺悶ｓ繧呈､懃衍縺ｧ縺阪ｋ

**Independent Test**: 繝ｭ繧ｰ繝輔ぃ繧､繝ｫ縺ｮ1陦後ｒ謇句虚縺ｧ譖ｸ縺肴鋤縺医◆蠕・`npx tsx scripts/verify-log.ts` 繧貞ｮ溯｡後＠縲∵隼縺悶ｓ陦後・繧､繝ｳ繝・ャ繧ｯ繧ｹ縺ｨ繧ｿ繧､繝繧ｹ繧ｿ繝ｳ繝励′蝣ｱ蜻翫＆繧後ｋ縺薙→繧堤｢ｺ隱阪☆繧・

### US1 螳溯｣・ち繧ｹ繧ｯ

- [X] T006 [US1] `src/logger/index.ts` 縺ｮ `writeLog` 繧呈僑蠑ｵ縺励※縲∫樟蝨ｨ縺ｮ繝ｭ繧ｰ繝輔ぃ繧､繝ｫ縺ｮ譛邨ゅお繝ｳ繝医Μ縺九ｉ `prevHash` 繧定ｪｭ縺ｿ霎ｼ縺ｿ縲～integrity.ts` 縺ｮ `computeHmac` 繧貞他縺ｳ蜃ｺ縺励※ `prevHash` / `currHash` 繧呈嶌縺崎ｾｼ繧繧医≧縺ｫ縺吶ｋ・・005 螳御ｺ・ｾ後↓逹謇・FR-001・・
- [X] T007 [P] [US1] `scripts/verify-log.ts` 繧呈眠隕丈ｽ懈・縺吶ｋ・亥ｼ墓焚縺ｪ縺・= config.json 縺ｮ `logFile` 繝・ぅ繝ｬ繧ｯ繝医Μ縺ｮ蜈ｨ `audit-*.jsonl` 繧貞ｯｾ雎｡縲～--all <dir>` 繧ｪ繝励す繝ｧ繝ｳ蟇ｾ蠢懊よ紛蜷域ｧ OK / FAIL 繧呈ｨ呎ｺ門・蜉帙↓陦ｨ遉ｺ縺礼ｵゆｺ・さ繝ｼ繝・0 or 1 繧定ｿ斐☆縲５005 螳御ｺ・ｾ後↓逹謇・FR-002 / contracts/cli-contract.md・・
- [X] T008 [US1] `tests/audit-compliance.test.ts` 繧呈眠隕丈ｽ懈・縺励※ US1 繝・せ繝医こ繝ｼ繧ｹ繧貞ｮ溯｣・☆繧具ｼ域ｭ｣蟶ｸ譖ｸ縺崎ｾｼ縺ｿ竊呈､懆ｨｼ PASS縲・陦梧隼縺悶ｓ竊巽AIL 縺ｧ陦檎分蜿ｷ縺御ｸ閾ｴ縲∵忰蟆ｾ荳肴ｭ｣霑ｽ險倪・FAIL縲√Ξ繧ｬ繧ｷ繝ｼ繧ｨ繝ｳ繝医Μ隴ｦ蜻翫・縺ｿ邨ゆｺ・さ繝ｼ繝・0 spec.md US1 繧ｷ繝翫Μ繧ｪ1窶・・峨４C-002: `performance.now()` 縺ｧ HMAC 險育ｮ玲凾髢薙ｒ險域ｸｬ縺・1繧ｨ繝ｳ繝医Μ縺ゅ◆繧・\u226410ms 縺ｧ縺ゅｋ縺薙→繧偵い繧ｵ繝ｼ繝医☆繧九・dge Case: 繝ｭ繧ｰ繝・ぅ繝ｬ繧ｯ繝医Μ縺ｸ縺ｮ譖ｸ縺崎ｾｼ縺ｿ讓ｩ髯舌′縺ｪ縺・ｴ蜷医↓ `writeLog` 縺後お繝ｩ繝ｼ繧偵せ繝ｭ繝ｼ縺吶ｋ縺薙→繧堤｢ｺ隱阪☆繧・

**Checkpoint**: US1 螳御ｺ・窶・`writeLog` 縺悟ｮ悟・諤ｧ繝輔ぅ繝ｼ繝ｫ繝峨ｒ莉倅ｸ弱＠縲，LI 縺ｧ謾ｹ縺悶ｓ讀懃衍縺悟虚菴懊☆繧・

---

## Phase 4: User Story 2 - 繝ｭ繧ｰ繝ｭ繝ｼ繝・・繧ｷ繝ｧ繝ｳ縺ｨ閾ｪ蜍募炎髯､・・2・・

**Goal**: 譌･莉伜､画峩繝ｻ繧ｵ繧､繧ｺ荳企剞縺ｧ繝ｭ繧ｰ繧偵Ο繝ｼ繝・・繧ｷ繝ｧ繝ｳ縺励∬ｵｷ蜍墓凾縺ｫ菫晄戟譛滄剞雜・℃繝輔ぃ繧､繝ｫ繧貞炎髯､縺吶ｋ

**Independent Test**: `retentionDays: 1` 繧定ｨｭ螳壹＠縲・譌･蜑阪・譌･莉倥ｒ蜷榊燕縺ｫ謖√▽繝繝溘・ `audit-YYYY-MM-DD.jsonl` 繧帝・鄂ｮ縺励◆蠕後い繝励Μ繧貞・襍ｷ蜍輔＠縺ｦ縲√◎縺ｮ繝輔ぃ繧､繝ｫ縺悟炎髯､縺輔ｌ繧九％縺ｨ繧堤｢ｺ隱阪☆繧・

### US2 螳溯｣・ち繧ｹ繧ｯ

- [X] T009 [P] [US2] `src/logger/rotation.ts` 繧呈眠隕丈ｽ懈・縺吶ｋ・医い繧ｯ繝・ぅ繝悶Ο繧ｰ繝輔ぃ繧､繝ｫ蜷・`audit-YYYY-MM-DD.jsonl` 逕滓・繝ｭ繧ｸ繝・け縲√し繧､繧ｺ荳企剞雜・℃譎ゅ・騾｣逡ｪ繧ｵ繝輔ぅ繝・け繧ｹ莉倥″譁ｰ繝輔ぃ繧､繝ｫ縺ｸ縺ｮ蛻・ｊ譖ｿ縺亥・逅・５004 螳御ｺ・ｾ後↓逹謇・FR-003 / data-model.md ﾂｧ5・・
- [X] T010 [P] [US2] `src/logger/retention.ts` 繧呈眠隕丈ｽ懈・縺吶ｋ・・audit-YYYY-MM-DD.jsonl` 繝輔ぃ繧､繝ｫ蜷阪°繧画律莉倥ｒ謚ｽ蜃ｺ縺励※菫晄戟譛滄俣雜・℃繧貞愛螳壹＠蜑企勁縺吶ｋ `runRetentionCleanup(logDir, retentionDays): Promise<string[]>` 繧貞ｮ溯｣・☆繧九ＡretentionDays === 0` 縺ｮ蝣ｴ蜷医・繧ｹ繧ｭ繝・・縲５004 螳御ｺ・ｾ後↓逹謇・FR-004 / research.md ﾂｧ3・・
- [X] T011 [US2] `src/logger/index.ts` 縺ｮ `initLogger` 繧呈僑蠑ｵ縺励※ `rotation.ts` 縺ｫ繧医ｋ繝輔ぃ繧､繝ｫ蜷肴ｱｺ螳壹→ `retention.ts` 縺ｮ繧ｯ繝ｪ繝ｼ繝ｳ繧｢繝・・蜻ｼ縺ｳ蜃ｺ縺励ｒ邨・∩霎ｼ繧・・009繝ｻT010 螳御ｺ・ｾ後↓逹謇・FR-003繝ｻFR-004・・
- [X] T012 [US2] `src/index.ts` 縺ｮ繧｢繝励Μ襍ｷ蜍募・逅・↓ `runRetentionCleanup` 蜻ｼ縺ｳ蜃ｺ縺励ｒ霑ｽ蜉縺励∝炎髯､繝輔ぃ繧､繝ｫ繧・`writeLog` 縺ｧ繝ｭ繧ｰ縺ｫ險倬鹸縺吶ｋ・・010繝ｻT011 螳御ｺ・ｾ後↓逹謇・FR-005・・
- [X] T013 [US2] `tests/audit-compliance.test.ts` 縺ｫ US2 繝・せ繝医こ繝ｼ繧ｹ繧定ｿｽ蜉縺吶ｋ・医し繧､繧ｺ雜・℃繝ｭ繝ｼ繝・・繧ｷ繝ｧ繝ｳ縲∵律莉伜､画峩繝ｭ繝ｼ繝・・繧ｷ繝ｧ繝ｳ縲∽ｿ晄戟譛滄俣雜・℃繝輔ぃ繧､繝ｫ蜑企勁縲～retentionDays=0` 縺ｯ蜑企勁縺励↑縺・spec.md US2 繧ｷ繝翫Μ繧ｪ1窶・・峨・dge Case: 繝ｭ繝ｼ繝・・繧ｷ繝ｧ繝ｳ荳ｭ縺ｫ繝励Ο繧ｻ繧ｹ縺後け繝ｩ繝・す繝･縺励◆蠕後∵ｬ｡蝗櫁ｵｷ蜍墓凾縺ｫ荳榊ｮ悟・縺ｪ繝ｭ繝ｼ繝・・繧ｷ繝ｧ繝ｳ蜈医ヵ繧｡繧､繝ｫ縺悟ｭ伜惠縺励※繧・`initLogger` 縺後お繝ｩ繝ｼ縺ｫ縺ｪ繧峨★譁ｰ繝輔ぃ繧､繝ｫ縺ｧ蜀埼幕縺ｧ縺阪ｋ縺薙→繧堤｢ｺ隱阪☆繧・

**Checkpoint**: US2 螳御ｺ・窶・繝ｭ繝ｼ繝・・繧ｷ繝ｧ繝ｳ縺ｨ襍ｷ蜍墓凾繧ｯ繝ｪ繝ｼ繝ｳ繧｢繝・・縺檎峡遶九＠縺ｦ蜍穂ｽ懊☆繧・

---

## Phase 5: User Story 3 - 蛟倶ｺｺ繝・・繧ｿ縺ｮ豸亥悉隕∵ｱょｯｾ蠢懶ｼ・3・・

**Goal**: 謖・ｮ夊ｭ伜挨蟄舌↓邏舌▼縺上Ο繧ｰ繧ｨ繝ｳ繝医Μ繧貞諺蜷榊喧縺励～redaction` 繝槭・繧ｫ繝ｼ繧呈諺蜈･縺吶ｋ CLI 繧呈署萓帙☆繧・

**Independent Test**: 迚ｹ螳壹・繝輔ぃ繧､繝ｫ繝代せ繧・`--identifier` 縺ｧ謖・ｮ壹＠縺ｦ `npx tsx scripts/redact-log.ts` 繧貞ｮ溯｡後＠縲∬ｩｲ蠖薙お繝ｳ繝医Μ縺ｮ `filePath` 縺・`[REDACTED]` 縺ｫ鄂ｮ謠帙＆繧後～event: 'redaction'` 繝槭・繧ｫ繝ｼ縺梧諺蜈･縺輔ｌ繧九％縺ｨ繧堤｢ｺ隱阪☆繧・

### US3 螳溯｣・ち繧ｹ繧ｯ

- [X] T014 [P] [US3] `src/logger/redaction.ts` 繧呈眠隕丈ｽ懈・縺吶ｋ・域欠螳夊ｭ伜挨蟄舌↓荳閾ｴ縺吶ｋ `filePath` 繧・`[REDACTED]` 縺ｫ鄂ｮ謠帙＠ `redactedIdentifierHash`・・HA-256 hex・峨ｒ菫晏ｭ倥☆繧九Ο繧ｸ繝・け縲～redaction` 繝槭・繧ｫ繝ｼ繧ｨ繝ｳ繝医Μ縺ｮ逕滓・縺ｨ謖ｿ蜈･繧貞ｮ溯｣・☆繧九５005 螳御ｺ・ｾ後↓逹謇・FR-006繝ｻFR-009 / data-model.md ﾂｧ4・・
- [X] T015 [P] [US3] `scripts/redact-log.ts` 繧呈眠隕丈ｽ懈・縺吶ｋ・・--identifier <path>` 蠑墓焚縲～--dry-run` 繧ｪ繝励す繝ｧ繝ｳ縲ょ・ `audit-*.jsonl` 繧定ｵｰ譟ｻ縺励※蛹ｿ蜷榊喧縺礼ｵ先棡繧呈ｨ呎ｺ門・蜉帙↓蝣ｱ蜻翫☆繧九５014 螳御ｺ・ｾ後↓逹謇・contracts/cli-contract.md・・
- [X] T016 [US3] `tests/audit-compliance.test.ts` 縺ｫ US3 繝・せ繝医こ繝ｼ繧ｹ繧定ｿｽ蜉縺吶ｋ・郁ｭ伜挨蟄蝉ｸ閾ｴ繧ｨ繝ｳ繝医Μ縺ｮ蛹ｿ蜷榊喧遒ｺ隱阪～redaction` 繝槭・繧ｫ繝ｼ謖ｿ蜈･遒ｺ隱阪・莉ｶ縺ｯ豁｣蟶ｸ邨ゆｺ・∝諺蜷榊喧蠕後・ verify-log 縺・PASS・・edaction 繧偵Μ繧ｻ繝・ヨ轤ｹ縺ｨ縺励※謇ｱ縺・ｼ鋭pec.md US3 繧ｷ繝翫Μ繧ｪ1窶・・峨４C-004: 1,000莉ｶ繝輔ぅ繧ｯ繧ｹ繝√Ε繧剃ｽｿ縺・∝諺蜷榊喧螳御ｺ・∪縺ｧ縺ｮ邨碁℃譎る俣縺・30,000ms 譛ｪ貅縺ｧ縺ゅｋ縺薙→繧・`vi.setSystemTime` + `performance.now()` 縺ｧ繧｢繧ｵ繝ｼ繝医☆繧・

**Checkpoint**: 蜈ｨ US 螳御ｺ・窶・謾ｹ縺悶ｓ讀懃衍繝ｻ繝ｭ繝ｼ繝・・繧ｷ繝ｧ繝ｳ繝ｻ豸亥悉隕∵ｱゅ・3讖溯・縺檎峡遶九＠縺ｦ蜍穂ｽ懊☆繧・

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 繝・せ繝亥・蜷域ｼ遒ｺ隱阪・繝峨く繝･繝｡繝ｳ繝域紛蜷医・quickstart 謇矩・､懆ｨｼ

- [X] T017 [P] `src/types/index.ts` 縺ｫ `VerificationResult` 縺ｨ `VerificationViolation` 繧､繝ｳ繧ｿ繝ｼ繝輔ぉ繝ｼ繧ｹ繧定ｿｽ蜉縺吶ｋ・・ata-model.md ﾂｧ3 縺ｮ蝙句ｮ夂ｾｩ繧呈ｭ｣蠑上お繧ｯ繧ｹ繝昴・繝茨ｼ・
- [X] T018 `npm test`・・yarn test`・峨ｒ螳溯｡後＠縺ｦ蜈ｨ繝・せ繝医せ繧､繝ｼ繝医′蜷域ｼ縺吶ｋ縺薙→繧堤｢ｺ隱阪☆繧具ｼ・C-005: 譌｢蟄倥ユ繧ｹ繝・100% 蜷域ｼ繧堤ｶｭ謖√∵眠隕・audit-compliance.test.ts 繧ょ性繧・・
- [X] T019 [P] `quickstart.md` 縺ｮ謇矩・ｼ・UDIT_HMAC_SECRET 險ｭ螳・竊・繧｢繝励Μ襍ｷ蜍・竊・verify-log 螳溯｡・竊・redact-log 螳溯｡鯉ｼ峨ｒ螳滄圀縺ｫ螳溯｡後＠縺ｦ蜍穂ｽ懊ｒ讀懆ｨｼ縺励∵焔鬆・・隱､繧翫′縺ゅｌ縺ｰ菫ｮ豁｣縺吶ｋ

---

## Dependencies & Execution Order

### 繝輔ぉ繝ｼ繧ｺ萓晏ｭ倬未菫・

```
Phase 1 (Setup)
    笏披楳竊・Phase 2 (Foundational)
             笏懌楳竊・Phase 3 (US1 P1) 笏竊・MVP 繝ｪ繝ｪ繝ｼ繧ｹ蜿ｯ閭ｽ
             笏懌楳竊・Phase 4 (US2 P2)
             笏披楳竊・Phase 5 (US3 P3)
                                   竊・
                              Phase 6 (Polish)
```

### 繝ｦ繝ｼ繧ｶ繝ｼ繧ｹ繝医・繝ｪ繝ｼ萓晏ｭ倬未菫・

- **US1・・1・・*: Phase 2 螳御ｺ・ｾ後↓髢句ｧ句庄閭ｽ縲ゆｻ悶せ繝医・繝ｪ繝ｼ縺ｫ髱樔ｾ晏ｭ・
- **US2・・2・・*: Phase 2 螳御ｺ・ｾ後↓髢句ｧ句庄閭ｽ縲６S1 縺ｨ荳ｦ蛻怜ｮ溯｡悟庄閭ｽ
- **US3・・3・・*: Phase 2 + T005・・ntegrity.ts・牙ｮ御ｺ・ｾ後↓髢句ｧ句庄閭ｽ縲６S1繝ｻUS2 縺ｨ荳ｦ蛻怜ｮ溯｡悟庄閭ｽ

### 繧ｿ繧ｹ繧ｯ蜀・ｾ晏ｭ倬未菫・

| 繧ｿ繧ｹ繧ｯ | 萓晏ｭ伜・ |
|--------|-------|
| T003, T004 | 縺ｪ縺暦ｼ井ｸｦ蛻怜ｮ溯｡悟庄・・|
| T005 | T003 |
| T006 | T005 |
| T007 | T005 |
| T008 | T005 / T006 / T007 螳御ｺ・ｾ鯉ｼ医ユ繧ｹ繝育腸蠅・性繧・・|
| T009, T010 | T004 |
| T011 | T009, T010 |
| T012 | T010, T011 |
| T013 | T009, T010, T011, T012 螳御ｺ・ｾ鯉ｼ医ユ繧ｹ繝育腸蠅・性繧・・|
| T014 | T005 |
| T015 | T014 |
| T016 | T014, T015 螳御ｺ・ｾ鯉ｼ医ユ繧ｹ繝育腸蠅・性繧・・|
| T017 | T003・亥梛螳夂ｾｩ縺ｮ謨ｴ逅・ｼ・|
| T018 | T008, T013, T016・亥・繝・せ繝亥ｮ溯｣・ｾ鯉ｼ・|
| T019 | T018 |

### 荳ｦ蛻怜ｮ溯｡後・讖滉ｼ・

**Phase 2 蜀・ｼ・hase 1 螳御ｺ・ｾ鯉ｼ・*:
```
T003 笏笏笏・
T004 笏笏笏､笏竊・T005
```

**Phase 3縲・ 縺ｮ US 髢難ｼ・hase 2 螳御ｺ・ｾ鯉ｼ・*:
```
T006, T007 笏竊・T008   (US1)
T009, T010 笏竊・T011 笏竊・T012 笏竊・T013  (US2)
T014 笏竊・T015 笏竊・T016             (US3)
```

---

## 螳溯｣・姶逡･

### MVP 繧ｹ繧ｳ繝ｼ繝暦ｼ・S1 縺ｮ縺ｿ・・

Phase 1 + Phase 2 + Phase 3・・001縲弋008・峨ｒ螳御ｺ・☆繧後・縲∵隼縺悶ｓ讀懃衍縺ｨ縺・≧譛驥崎ｦ∵ｩ溯・・・1・峨′蜍穂ｽ懊☆繧区怙蟆剰｣ｽ蜩√↓縺ｪ繧九・

### 謗ｨ螂ｨ螳溯｣・・ｺ擾ｼ医す繝ｳ繧ｰ繝ｫ髢狗匱閠・ｼ・

```
T001 竊・T003 竊・T004 竊・T005 竊・T006 竊・T007 竊・T008
竊・T009 竊・T010 竊・T011 竊・T012 竊・T013
竊・T014 竊・T015 竊・T016
竊・T017 竊・T018 竊・T019
```
