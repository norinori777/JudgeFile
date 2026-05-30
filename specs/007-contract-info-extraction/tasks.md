# Tasks: 螂醍ｴ・嶌謖ｯ繧雁・縺第凾縺ｮ螂醍ｴ・ュ蝣ｱ謚ｽ蜃ｺ繝ｻ繝・く繧ｹ繝亥・蜉・

**Input**: `specs/007-contract-info-extraction/` 縺ｮ險ｭ險医ラ繧ｭ繝･繝｡繝ｳ繝・

**Prerequisites**: plan.md 笨・| spec.md 笨・| research.md 笨・| data-model.md 笨・| contracts/ 笨・

---

## Phase 1: Setup・亥・譛峨う繝ｳ繝輔Λ・・

**Purpose**: 蝙句ｮ夂ｾｩ繝ｻ險ｭ螳壹せ繧ｭ繝ｼ繝樊僑蠑ｵ縲ゅ☆縺ｹ縺ｦ縺ｮ蠕檎ｶ壹ヵ繧ｧ繝ｼ繧ｺ縺ｮ蜑肴署縺ｨ縺ｪ繧・

- [x] T001 `src/types/index.ts` 縺ｫ `ContractPeriod` 蝙九・`ContractInfo` 蝙九ｒ霑ｽ蜉縺励～AuditLogEntry` 縺ｫ `contractSubject?: string | null`繝ｻ`contractPeriod?: ContractPeriod | null`繝ｻ`contractExtractionError?: string` 繝輔ぅ繝ｼ繝ｫ繝峨ｒ霑ｽ蜉縺吶ｋ
- [x] T002 [P] `src/config/schema.ts` 縺ｮ `ConfigSchema` 縺ｫ `contractCategoryLabel` 繝輔ぅ繝ｼ繝ｫ繝会ｼ・z.string().default('螂醍ｴ・嶌')`・峨ｒ霑ｽ蜉縺吶ｋ

**Checkpoint**: 蝙九・險ｭ螳壹せ繧ｭ繝ｼ繝槭′謠・▲縺溽憾諷九ゆｻ･髯阪・繝輔ぉ繝ｼ繧ｺ縺ｯ縺薙％縺九ｉ逹謇九〒縺阪ｋ

---

## Phase 2: Foundational・医ヶ繝ｭ繝・く繝ｳ繧ｰ蜑肴署・・

**Purpose**: `extractContractInfo()` 髢｢謨ｰ譛ｬ菴薙・螳溯｣・６S1縲弑S4 縺吶∋縺ｦ縺御ｾ晏ｭ倥☆繧・

**笞・・CRITICAL**: 縺薙・繝輔ぉ繝ｼ繧ｺ縺悟ｮ御ｺ・☆繧九∪縺ｧ queue 邨ｱ蜷茨ｼ・hase 3・峨↓縺ｯ騾ｲ繧√↑縺・

- [x] T003 `src/extractor/contract.ts` 繧呈眠隕丈ｽ懈・縺励～ContractInfoSchema`・・od・峨→ `buildContractPrompt()` 繧貞ｮ溯｣・☆繧具ｼ・ontracts/contract-info-schema.md 縺ｮ繧ｹ繧ｭ繝ｼ繝槭・繝励Ο繝ｳ繝励ヨ莉墓ｧ倥↓蠕薙≧・・
- [x] T004 `src/extractor/contract.ts` 縺ｫ `extractContractInfo(text: string, config: Config): Promise<ContractInfo>` 髢｢謨ｰ繧貞ｮ溯｣・☆繧九０penAI SDK 縺ｮ `response_format: { type: 'json_object' }` 繧剃ｽｿ逕ｨ縺励～classify()` 縺ｨ蜷後ヱ繧ｿ繝ｼ繝ｳ縺ｧ API 蜻ｼ縺ｳ蜃ｺ縺励・JSON 繝代・繧ｹ繝ｻ`ContractInfoSchema` 縺ｫ繧医ｋ Zod 讀懆ｨｼ繧定｡後≧縲ゅち繧､繝繧｢繧ｦ繝医・429繝ｻJSON 繝代・繧ｹ螟ｱ謨励・繧ｹ繧ｭ繝ｼ繝樔ｸ堺ｸ閾ｴ縺ｯ縺吶∋縺ｦ萓句､悶→縺励※繧ｹ繝ｭ繝ｼ縺吶ｋ
- [x] T005 [P] `src/extractor/contract.ts` 縺ｫ `.meta.json` 隱ｭ縺ｿ霎ｼ縺ｿ繝ｻ繝輔ぅ繝ｼ繝ｫ繝芽ｿｽ蜉繝ｻ荳頑嶌縺堺ｿ晏ｭ倥ｒ陦後≧繝倥Ν繝代・髢｢謨ｰ `updateMetaJson(destDir: string, contractInfo: ContractInfo): Promise<void>` 繧貞ｮ溯｣・☆繧九ＡdestDir` 縺ｯ謖ｯ繧雁・縺大・繝輔ぃ繧､繝ｫ縺ｮ繝輔Ν繝代せ・・decision.destDir`・峨〒縺ゅｊ縲～.meta.json` 縺ｯ `destDir + '.meta.json'` 縺ｨ縺励※隗｣豎ｺ縺吶ｋ・域里蟄・meta 譖ｸ縺崎ｾｼ縺ｿ繝代ち繝ｼ繝ｳ縺ｨ蜷後§・峨Ａ.meta.json` 縺悟ｭ伜惠縺励↑縺・ｴ蜷医・ `console.warn` 繧貞・蜉帙＠縺ｦ繧ｹ繧ｭ繝・・縺吶ｋ・・R-005・・

**Checkpoint**: `extractContractInfo()` 縺悟腰迢ｬ縺ｧ繝・せ繝亥庄閭ｽ縺ｪ迥ｶ諷・

---

## Phase 3: User Story 1 窶・螂醍ｴ・嶌謖ｯ繧雁・縺第凾縺ｫ螂醍ｴ・ュ蝣ｱ縺瑚・蜍墓歓蜃ｺ縺輔ｌ繧・(Priority: P1) 識 MVP

**Goal**: 繧ｫ繝・ざ繝ｪ縺後悟･醍ｴ・嶌縲阪・繝輔ぃ繧､繝ｫ縺梧険繧雁・縺代ｉ繧後ｋ縺ｨ `.meta.json` 縺ｨ逶｣譟ｻ繝ｭ繧ｰ縺ｫ螂醍ｴ・ュ蝣ｱ縺瑚ｨ倬鹸縺輔ｌ繧・

**Independent Test**: 螂醍ｴ・嶌繝・く繧ｹ繝医ｒ蜷ｫ繧繝輔ぃ繧､繝ｫ繧貞・逅・ｾ後∵険繧雁・縺大・縺ｮ `.meta.json` 縺ｫ `contractSubject`繝ｻ`contractPeriod` 縺悟ｭ伜惠縺励∫屮譟ｻ繝ｭ繧ｰ縺ｮ `event: 'completed'` 繧ｨ繝ｳ繝医Μ縺ｫ蜷後ヵ繧｣繝ｼ繝ｫ繝峨′蜷ｫ縺ｾ繧後ｋ縺薙→繧堤｢ｺ隱阪☆繧・

### Implementation for User Story 1

- [x] T006 [US1] `src/queue/index.ts` 縺ｮ `enqueue()` 蜀・・ `moveFile()` 螳御ｺ・ｾ後↓螂醍ｴ・ュ蝣ｱ謚ｽ蜃ｺ繝悶Ο繝・け繧定ｿｽ蜉縺吶ｋ縲Ａclassification.category.toLowerCase() === (config.contractCategoryLabel ?? '螂醍ｴ・嶌').toLowerCase()` 縺九▽ `decision.moveType !== 'error'` 縺ｮ蝣ｴ蜷医・縺ｿ `extractContractInfo()` 繧貞他縺ｳ蜃ｺ縺呻ｼ・R-001繝ｻFR-008繝ｻFR-009・・
- [x] T007 [US1] `src/queue/index.ts` 縺ｮ螂醍ｴ・ュ蝣ｱ謚ｽ蜃ｺ繝悶Ο繝・け蜀・〒 `updateMetaJson(decision.destDir, contractInfo)` 繧貞他縺ｳ蜃ｺ縺励～.meta.json` 縺ｫ `contractSubject` 縺ｨ `contractPeriod` 繧定ｿｽ險倥☆繧具ｼ・R-005・峨ＡmoveType: 'review'` 縺ｮ蝣ｴ蜷医ｂ蜷後§ `decision.destDir` 繧剃ｽｿ逕ｨ縺吶ｋ
- [x] T008 [US1] `src/queue/index.ts` 縺ｮ `completedEntry` 逕滓・驛ｨ蛻・↓ `contractSubject` 縺ｨ `contractPeriod` 繝輔ぅ繝ｼ繝ｫ繝峨ｒ霑ｽ蜉縺吶ｋ縲ら屮譟ｻ繝ｭ繧ｰ縺ｫ譛ｬ譁・ユ繧ｭ繧ｹ繝医ｒ蜷ｫ繧√↑縺・宛邏・ｼ・R-006 / 譌｢蟄・FR-014・峨ｒ螳医ｋ

---

## Phase 4: User Story 2 窶・謚ｽ蜃ｺ螟ｱ謨玲凾繧ゅヱ繧､繝励Λ繧､繝ｳ縺檎ｶ咏ｶ壹☆繧・(Priority: P1)

**Goal**: 螂醍ｴ・ュ蝣ｱ謚ｽ蜃ｺ縺悟､ｱ謨励＠縺ｦ繧ゅヵ繧｡繧､繝ｫ謖ｯ繧雁・縺代・螳御ｺ・＠縺ｦ縺翫ｊ縲～contractExtractionError` 縺ｮ縺ｿ縺瑚ｨ倬鹸縺輔ｌ繧・

**Independent Test**: AI 蜻ｼ縺ｳ蜃ｺ縺励ｒ繝｢繝・け縺励※繧ｨ繝ｩ繝ｼ繧堤匱逕溘＆縺帙～event: 'completed'` 縺瑚ｨ倬鹸縺輔ｌ `contractExtractionError` 繝輔ぅ繝ｼ繝ｫ繝峨′蜷ｫ縺ｾ繧後ｋ縺薙→繝ｻ繝輔ぃ繧､繝ｫ縺梧ｭ｣縺励＞謖ｯ繧雁・縺大・縺ｫ蟄伜惠縺吶ｋ縺薙→繧堤｢ｺ隱阪☆繧・

### Implementation for User Story 2

- [x] T009 [US2] `src/queue/index.ts` 縺ｮ螂醍ｴ・ュ蝣ｱ謚ｽ蜃ｺ繝悶Ο繝・け繧・`try/catch` 縺ｧ蝗ｲ縺ｿ縲∝､ｱ謨玲凾縺ｯ `contractExtractionError = err instanceof Error ? err.message : String(err)` 縺ｫ險倬鹸縺励※蜃ｦ逅・ｒ邯咏ｶ壹☆繧具ｼ・R-007繝ｻFR-008・・
- [x] T010 [US2] `src/queue/index.ts` 縺ｮ `completedEntry` 逕滓・驛ｨ蛻・↓ `...(contractExtractionError ? { contractExtractionError } : {})` 繧定ｿｽ蜉縺励√お繝ｩ繝ｼ譎ゅ・縺ｿ逶｣譟ｻ繝ｭ繧ｰ縺ｫ險倬鹸縺吶ｋ縲ＡcontractSubject`繝ｻ`contractPeriod` 縺ｯ繧ｨ繝ｩ繝ｼ譎ゅ・蜷ｫ繧√↑縺・ｼ・R-007・・

---

## Phase 5: User Story 3 窶・謚ｽ蜃ｺ邨先棡縺檎屮譟ｻ繝ｭ繧ｰ縺ｫ險倬鹸縺輔ｌ繧・(Priority: P2)

**Goal**: 螂醍ｴ・ュ蝣ｱ・・null` 蜷ｫ繧・峨′逶｣譟ｻ繝ｭ繧ｰ縺ｮ `event: 'completed'` 繧ｨ繝ｳ繝医Μ縺ｫ繝阪せ繝・JSON 縺ｨ縺励※險倬鹸縺輔ｌ繧・

**Independent Test**: 逶｣譟ｻ繝ｭ繧ｰ繧定ｪｭ縺ｿ霎ｼ縺ｿ縲∝･醍ｴ・嶌繧ｫ繝・ざ繝ｪ蜃ｦ逅・ｾ後・繧ｨ繝ｳ繝医Μ縺ｫ `contractSubject` 縺ｨ `contractPeriod`・医ロ繧ｹ繝・JSON 繧ｪ繝悶ず繧ｧ繧ｯ繝茨ｼ峨′蜷ｫ縺ｾ繧後ｋ縺薙→繧堤｢ｺ隱阪☆繧・

### Implementation for User Story 3

- [x] T011 [US3] `tests/contract-info-extraction.test.ts` 繧呈眠隕丈ｽ懈・縺励～extractContractInfo()` 縺ｮ繝ｦ繝九ャ繝医ユ繧ｹ繝医ｒ螳溯｣・☆繧九よｭ｣蟶ｸ謚ｽ蜃ｺ・医ヵ繝ｫ・峨・`null` 繝輔ぅ繝ｼ繝ｫ繝会ｼ域悄髢薙・螳壹ａ縺ｪ縺励ｄ閾ｪ蜍墓峩譁ｰ譎ゅ↓ `contractPeriod.start`/`end` 縺・`null` 縺ｧ `note` 縺ｫ繝・く繧ｹ繝医′蜈･繧九こ繝ｼ繧ｹ繧貞性繧・峨・API 繧ｨ繝ｩ繝ｼ繝ｻJSON 繝代・繧ｹ螟ｱ謨励・Zod 讀懆ｨｼ螟ｱ謨励・繧ｱ繝ｼ繧ｹ繧偵き繝舌・縺吶ｋ
- [x] T012 [P] [US3] `tests/contract-info-extraction.test.ts` 縺ｫ `updateMetaJson()` 縺ｮ繝・せ繝医ｒ霑ｽ蜉縺吶ｋ縲Ａ.meta.json` 縺悟ｭ伜惠縺吶ｋ蝣ｴ蜷医・霑ｽ險倥・蟄伜惠縺励↑縺・ｴ蜷医・隴ｦ蜻翫せ繧ｭ繝・・繧偵き繝舌・縺吶ｋ

---

## Phase 6: User Story 4 窶・譌｢蟄倥ヵ繝ｭ繝ｼ縺ｸ縺ｮ蠖ｱ髻ｿ縺後↑縺・(Priority: P3)

**Goal**: 讖溯・霑ｽ蜉蠕後ｂ螂醍ｴ・嶌莉･螟悶・繧ｫ繝・ざ繝ｪ繝輔ぃ繧､繝ｫ縺ｧ螂醍ｴ・ュ蝣ｱ謚ｽ蜃ｺ縺悟ｮ溯｡後＆繧後★縲∵里蟄倥・蜃ｦ逅・′蠕捺擂縺ｩ縺翫ｊ蜍穂ｽ懊☆繧・

**Independent Test**: 縲瑚ｫ区ｱよ嶌縲阪き繝・ざ繝ｪ縺ｮ繝輔ぃ繧､繝ｫ繧貞・逅・ｾ後～.meta.json` 縺ｫ `contractSubject`繝ｻ`contractPeriod` 縺悟ｭ伜惠縺励↑縺・％縺ｨ繧堤｢ｺ隱阪☆繧・

### Implementation for User Story 4

- [x] T013 [P] [US4] `tests/contract-info-extraction.test.ts` 縺ｫ髱槫･醍ｴ・嶌繧ｫ繝・ざ繝ｪ・井ｾ具ｼ壹瑚ｫ区ｱよ嶌縲搾ｼ峨ヵ繧｡繧､繝ｫ繧貞・逅・＠縺溷ｴ蜷医↓ `extractContractInfo()` 縺悟他縺ｰ繧後↑縺・％縺ｨ繧堤｢ｺ隱阪☆繧九ユ繧ｹ繝医ｒ霑ｽ蜉縺吶ｋ・・R-001 / SC-004・・

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 險ｭ螳壽紛蜷域ｧ遒ｺ隱阪・繧ｨ繝ｩ繝ｼ譁・ｨ邨ｱ荳繝ｻ譌｢蟄倥ユ繧ｹ繝医・髱樣陦檎｢ｺ隱・

- [x] T014 [P] `src/extractor/index.ts` 縺ｫ `contract.ts` 縺碁←蛻・↓繧ｨ繧ｯ繧ｹ繝昴・繝医＆繧後※縺・ｋ縺狗｢ｺ隱阪＠縲∝ｿ・ｦ√↑繧・`export { extractContractInfo, ContractInfoSchema } from './contract.js'` 繧定ｿｽ蜉縺吶ｋ
- [x] T015 譌｢蟄倥ユ繧ｹ繝茨ｼ・tests/config-schema.test.ts` 遲会ｼ峨′ `contractCategoryLabel` 縺ｮ霑ｽ蜉蠕後ｂ縺吶∋縺ｦ PASS 縺吶ｋ縺薙→繧・`yarn test` 縺ｧ遒ｺ隱阪＠縲・陦後′縺ゅｌ縺ｰ菫ｮ豁｣縺吶ｋ

---

## 萓晏ｭ倥げ繝ｩ繝・

```
T001 竊・T003 竊・T004 竊・T006 竊・T007 竊・T008
T002 竊・T006
T003 竊・T005 竊・T007
T004 竊・T009 竊・T010
T006 竊・T009
T008 + T010 竊・T011
T011 竊・T015
```

**User Story 螳御ｺ・・ｺ・*: US1・・006窶典008・俄・ US2・・009窶典010・俄・ US3・・011窶典012・俄・ US4・・013・・

---

## 荳ｦ蛻怜ｮ溯｡御ｾ・

### US1 逹謇区凾・・hase 2 螳御ｺ・ｾ鯉ｼ・

```
繝｡繧､繝ｳ繝ｩ繧､繝ｳ: T006 竊・T007 竊・T008
荳ｦ蛻怜庄閭ｽ:    T005・・pdateMetaJson 螳溯｣・ｼ峨→ T002・・onfig 繧ｹ繧ｭ繝ｼ繝橸ｼ峨・ T006 蜑阪↓迢ｬ遶句ｮ溯｡悟庄
```

### US3 逹謇区凾・・S1繝ｻUS2 螳御ｺ・ｾ鯉ｼ・

```
荳ｦ蛻怜庄閭ｽ: T011 縺ｨ T012 縺ｯ迢ｬ遶九＠縺溘ユ繧ｹ繝医こ繝ｼ繧ｹ縺ｮ縺溘ａ蜷梧凾逹謇句庄
          T013・・S4 繝・せ繝茨ｼ峨ｂ T011 縺ｨ荳ｦ蛻怜ｮ溯｡悟庄
```

---

## 螳溯｣・姶逡･

**MVP 繧ｹ繧ｳ繝ｼ繝・*: Phase 1 + Phase 2 + Phase 3・・001縲弋008・・ 
竊・螂醍ｴ・嶌繧ｫ繝・ざ繝ｪ縺ｮ繝輔ぃ繧､繝ｫ縺ｫ蟇ｾ縺励※螂醍ｴ・ュ蝣ｱ縺梧歓蜃ｺ繝ｻ險倬鹸縺輔ｌ繧区怙蟆丞虚菴懊ｒ螳溽樟縺吶ｋ

**谿ｵ髫守噪繝・Μ繝舌Μ繝ｼ**:
1. T001繝ｻT002・亥梛繝ｻ險ｭ螳夲ｼ俄・ 2. T003縲弋005・・xtractContractInfo 髢｢謨ｰ・俄・ 3. T006縲弋008・・ueue 邨ｱ蜷茨ｼ俄・ 4. T009縲弋010・医お繝ｩ繝ｼ繝上Φ繝峨Μ繝ｳ繧ｰ・俄・ 5. T011縲弋015・医ユ繧ｹ繝医・蜩∬ｳｪ・・

---

## 螳溯｣・し繝槭Μ繝ｼ

| 謖・ｨ・| 蛟､ |
|------|---|
| 邱上ち繧ｹ繧ｯ謨ｰ | 15 |
| US1・亥･醍ｴ・ュ蝣ｱ謚ｽ蜃ｺ繝ｻ險倬鹸・榎 T006繝ｻT007繝ｻT008・・ 繧ｿ繧ｹ繧ｯ・・|
| US2・亥､ｱ謨礼ｶ咏ｶ夲ｼ榎 T009繝ｻT010・・ 繧ｿ繧ｹ繧ｯ・・|
| US3・育屮譟ｻ繝ｭ繧ｰ・榎 T011繝ｻT012・・ 繧ｿ繧ｹ繧ｯ・・|
| US4・域里蟄伜ｽｱ髻ｿ縺ｪ縺暦ｼ榎 T013・・ 繧ｿ繧ｹ繧ｯ・・|
| 繧ｻ繝・ヨ繧｢繝・・繝ｻ蝓ｺ逶､ | T001縲弋005・・ 繧ｿ繧ｹ繧ｯ・・|
| Polish | T014繝ｻT015・・ 繧ｿ繧ｹ繧ｯ・・|
| 荳ｦ蛻怜ｮ溯｡梧ｩ滉ｼ・| T002繝ｻT005繝ｻT011繝ｻT012繝ｻT013繝ｻT014・・ 繧ｿ繧ｹ繧ｯ・・|
| MVP 繧ｹ繧ｳ繝ｼ繝・| T001縲弋008・・ 繧ｿ繧ｹ繧ｯ・・|
| 譁ｰ隕上ヵ繧｡繧､繝ｫ | 2・・src/extractor/contract.ts`繝ｻ`tests/contract-info-extraction.test.ts`・・|
| 螟画峩繝輔ぃ繧､繝ｫ | 3・・src/types/index.ts`繝ｻ`src/config/schema.ts`繝ｻ`src/queue/index.ts`・・|

**繝輔か繝ｼ繝槭ャ繝域､懆ｨｼ**: 蜈ｨ繧ｿ繧ｹ繧ｯ縺・`- [x] T### [P?] [US?] 隱ｬ譏・繝輔ぃ繧､繝ｫ繝代せ莉倥″` 蠖｢蠑上↓貅匁侠
