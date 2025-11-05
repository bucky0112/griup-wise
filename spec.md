# Group-Wise MVP 規格

## 1. 產品目標（MVP）
- 學生以「姓名 + 學號」登入，不提供額外註冊流程。
- 學生完成測驗後，系統計算分數但不對學生公開。
- 管理者可在後台檢視分數，並可依平均分數使用蛇形分配完成自動分組。
- 分數僅在後台可見，學生端僅能在管理者公開時看到分組結果。

## 2. 角色與權限（MVP）
- **Admin（管理者）**：建立班級、建立測驗與題目、檢視分數、觸發分組、（可選）公開分組名單。
- **Student（學生）**：以姓名與學號登入指定測驗、作答、查看是否被分到組別（不顯示分數）。
- MVP 不實作學生註冊；管理者登入可採用最簡密碼或既有管理帳號機制（此規格不展開）。

## 3. 資料庫模型（PostgreSQL + Drizzle ORM 對應結構）
- 欄位型別以 PostgreSQL 為主；主鍵使用 `uuid`；時間欄位使用 `timestamptz`。
- 唯一性與外鍵為 MVP 關鍵，請完整實作。

### 3.1 主體與結構
#### classes（班級）
- `id` (`uuid`, PK)
- `title` (`text`, not null)
- `expected_size` (`int`, nullable)：預期總人數（純參考）
- `target_group_size` (`int`, nullable)：理想每組人數（純參考）
- `created_by` (`text`/`uuid`, not null, fk → admins.id)：管理者識別（依既有管理者系統）班級建立者
- `created_at` (`timestamptz`, default `now`)

#### quizzes（測驗）
- `id` (`uuid`, PK)
- `class_id` (`uuid`, FK → `classes.id`, not null)
- `title` (`text`, not null)
- `is_active` (`boolean`, default `false`)：是否開放作答
- `show_group_publicly` (`boolean`, default `false`)：是否讓學生可看分組名單（仍不含分數）
- `created_at` (`timestamptz`, default `now`)
- Index：`(class_id, is_active)`
- created_by (uuid, fk → admins.id): 測驗建立者（或最後編輯者）

#### questions（題目）
- `id` (`uuid`, PK)
- `quiz_id` (`uuid`, FK → `quizzes.id`, not null)
- `type` (`enum('single' | 'multiple' | 'boolean' | 'short_text' | 'numeric')`, not null)
- `prompt` (`text`, not null)
- `options` (`jsonb`, nullable)：單選或多選選項
- `answer_key` (`jsonb`, not null)：正確答案（依題型定義）
- `score` (`numeric`, not null)：題目配分（建議 `numeric` 支援小數）
- `order_index` (`int`, not null)
- Index：`(quiz_id, order_index)`

#### participants（參與者）
- `id` (`uuid`, PK)
- `quiz_id` (`uuid`, FK → `quizzes.id`, not null)
- `display_name` (`text`, not null)
- `student_no` (`text`, not null)：建議「去空白 + 大寫」後存
- `unique_key` (`text`, not null)：建議格式 `${quiz_id}:${student_no}`
- `created_at` (`timestamptz`, default `now`)
- Unique：`(quiz_id, student_no)`；`unique_key`
  - 理由：同一測驗同一學號至多產生一筆 participant，避免重複或冒名登入。

#### submissions（交卷）
- `id` (`uuid`, PK)
- `quiz_id` (`uuid`, FK → `quizzes.id`, not null)
- `participant_id` (`uuid`, FK → `participants.id`, not null)
- `total_score` (`numeric`, not null, default `0`)
- `submitted_at` (`timestamptz`, default `now`)
- Unique：`(quiz_id, participant_id)`（MVP 限制一人一次交卷；未來若允許重作可改為多列並新增 `attempt_no`）

#### answers（各題作答）
- `id` (`uuid`, PK)
- `submission_id` (`uuid`, FK → `submissions.id`, not null)
- `question_id` (`uuid`, FK → `questions.id`, not null)
- `response` (`jsonb`, not null)：學生答案
- `earned_score` (`numeric`, not null, default `0`)
- Unique：`(submission_id, question_id)`

#### groups（分組紀錄）
- `id` (`uuid`, PK)
- `quiz_id` (`uuid`, FK → `quizzes.id`, not null)
- `name` (`text`, not null)：例如「第 1 組」
- `order_index` (`int`, not null)
- Unique：`(quiz_id, order_index)`

#### group_members（組員）
- `id` (`uuid`, PK)
- `group_id` (`uuid`, FK → `groups.id`, not null)
- `participant_id` (`uuid`, FK → `participants.id`, not null)
- `rank_index` (`int`, not null)：紀錄分配順序（蛇形分配追蹤用）
- Unique：`(group_id, participant_id)`

> 建議所有外鍵皆設定 `ON DELETE CASCADE`：刪除 quiz 時連動刪除其 groups、group_members、questions、participants、submissions、answers。

#### admins (管理者帳號)
| 欄位              | 型別           | 說明                 |
| --------------- | ------------ | ------------------ |
| `id`            | uuid, pk     | 管理者識別碼             |
| `name`          | text         | 顯示名稱               |
| `email`         | text, unique | 登入帳號               |
| `password_hash` | text         | 密碼雜湊值（或以 OAuth 取代） |
| `created_at`    | timestamptz  | 建立時間               |


### 3.2 ER 圖（Mermaid）
```mermaid
erDiagram
    admins ||--o{ classes : "owns"
    admins ||--o{ quizzes : "creates"
    classes ||--o{ quizzes : "has"
    quizzes ||--o{ questions : "has"
    quizzes ||--o{ participants : "has"
    quizzes ||--o{ submissions : "has"
    quizzes ||--o{ groups : "has"
    submissions ||--o{ answers : "has"
    groups ||--o{ group_members : "has"
    participants ||--o{ submissions : "by"
    participants ||--o{ group_members : "in"
    questions ||--o{ answers : "answered_by"

    admins {
        uuid id PK
        text name
        text email UNIQUE
        text password_hash
        timestamptz created_at
      }

    classes {
      uuid id PK
      text title
      int expected_size
      int target_group_size
      text created_by
      timestamptz created_at
    }

    quizzes {
      uuid id PK
      uuid class_id FK
      text title
      boolean is_active
      boolean show_group_publicly
      timestamptz created_at
    }

    questions {
      uuid id PK
      uuid quiz_id FK
      text type
      text prompt
      jsonb options
      jsonb answer_key
      numeric score
      int order_index
    }

    participants {
      uuid id PK
      uuid quiz_id FK
      text display_name
      text student_no
      text unique_key
      timestamptz created_at
    }

    submissions {
      uuid id PK
      uuid quiz_id FK
      uuid participant_id FK
      numeric total_score
      timestamptz submitted_at
    }

    answers {
      uuid id PK
      uuid submission_id FK
      uuid question_id FK
      jsonb response
      numeric earned_score
    }

    groups {
      uuid id PK
      uuid quiz_id FK
      text name
      int order_index
    }

    group_members {
      uuid id PK
      uuid group_id FK
      uuid participant_id FK
      int rank_index
    }
```

## 4. 業務規則（MVP 必要）
### 4.1 登入（學生側）
- 學生在指定測驗的登入頁輸入 `display_name` 與 `student_no`。
- 系統以 `(quiz_id, student_no)` 查找 participants：
  - 已存在 → 直接沿用該 participant。
  - 不存在 → 新增 participant，`unique_key = ${quiz_id}:${student_no}`。
- 以 Cookie Session（或等效方案）保存 `{quiz_id, participant_id}`，有效期需覆蓋課堂時長（建議 6 小時）。
- 不做學生註冊、不需密碼；知道學號即可回到同一身分。

### 4.2 題目存取
- 學生讀取題目時不可取得 `answer_key`。
- 題目順序由 `order_index` 控制；MVP 不做亂數洗牌（可後續擴充）。

### 4.3 作答與計分
- 交卷時依 `questions.type` 比對 `answers.response` 與 `answer_key`，計算 `earned_score`，並彙總為 `submissions.total_score`。
- 不回傳分數給學生，只回傳 `submission_id` 或成功訊息。
- `submissions` 針對 `(quiz_id, participant_id)` 設唯一約束：每人一次。
- 若需允許重交：取消唯一約束、增加 `attempt_no`，並定義分組策略採用「最高分」或「最後一次」。

### 4.4 分組（管理者）
- 取得該 quiz 全部 `submissions` 與 `total_score`，由高到低排序（同分可用 `submitted_at` 或 `student_no` 做穩定次序）。
- 設定分組模式（二擇一；MVP 任選其一即可）：
  - 按每組人數：給定 `group_size` → `group_count = ceil(N / group_size)`
  - 按組數：給定 `group_count` → `group_size = ceil(N / group_count)`
- 採用蛇形分配（serpentine）：第一輪 `1 → G`，第二輪 `G → 1`，往返直到分配完，將高分平均打散。
- 以資料庫交易清空舊有 `groups` 與 `group_members`，重建本次分組結果；`rank_index` 用來記錄分配序。

### 4.5 公開範圍
- 後台可見每位學生的分數與統計。
- 學生端僅能看到組別名單（`display_name`, `student_no`），不含分數；是否公開由 `quizzes.show_group_publicly` 控制。

### 4.6 邊界與防呆
- 重複登入：`quiz_id + student_no` 自動回原 participant。
- 姓名變更：MVP 預設不自動更新（避免冒名），必要時由管理者後台手動校正。
- 未交卷者：MVP 分組只納入已交卷者；若要納入未交卷者，分數視為 0，需在後台提供選項。
- 學號正規化：登入時強制 trim、去空白、轉大寫，避免同一學號出現多筆。
- 唯一約束：必須建立 `(quiz_id, student_no)` 與 `unique_key` 的 unique index，自資料庫層阻止重複。
- 刪除行為：`ON DELETE CASCADE` 保持資料一致性；刪除 quiz 會連鎖刪關聯資料。

## 5. 產品流程（E2E 運作）
### 5.1 管理者流程
- 建立班級（`classes`）。
- 在班級下建立測驗（`quizzes`），初始設定 `is_active = false`。
- 新增題目（`questions`），設定 `order_index`、`score` 與 `answer_key`。
- 將 `is_active = true` 開放測驗，並提供登入連結或 QR Code。
- 上課過程中可觀察登入人數與交卷人數。
- 測驗結束後一鍵分組（設定每組人數或組數 → 產生 `groups` 與 `group_members`）。
- 視需要切換 `show_group_publicly = true`，讓學生查詢組別。
- 後台可匯出 CSV（`group`, `student_no`, `display_name`）（MVP 可選）。

### 5.2 學生流程
- 開啟測驗登入頁 → 輸入姓名與學號 → 登入成功。
- 進入作答頁 → 完成所有題目 → 交卷。
- 看到「提交成功」頁（不顯示分數）。
- 若管理者公開分組，可在分組頁查看自己被分到哪一組。

## 6. 非功能性需求（MVP 級）
- **安全**：學生端僅使用 HTTP-only Cookie 標記會話，避免在前端暴露分數；後台端點需受管控（簡密碼或既有管理系統）。
- **一致性**：分組操作使用資料庫交易；外鍵設定 `ON DELETE CASCADE`。
- **效能**：支援數十至兩三百人；`submissions.total_score` 事先彙總避免每次重算。
- **觀測**：紀錄登入、交卷、分組觸發等關鍵事件以利教學追蹤。
- **在地化**：以正規化處理學號格式差異（空白、大寫、全半形）。

## 7. 驗收標準（MVP）
- 學生能以姓名與學號登入指定測驗，且同學號會回到同一身分。
- 學生能完成作答並成功交卷；學生端看不到分數。
- 管理者能看到每位學生的總分、交卷時間與基本統計。
- 一鍵分組會產生 `G` 個組別，並以蛇形分配打散高分；結果寫入 `groups` 與 `group_members`。
- 切換 `show_group_publicly` 後，學生端能看到自己的組別與整體名單（不含分數）。

## 8. 最小設定建議（MVP 預設）
- 分組模式預設：按每組人數（例如 4 人一組）。
- 分組對象：僅包含已交卷者。
- 題型評分：
  - `single` / `boolean`：完全相同得滿分，否則 0。
  - `multiple`：全部答對才得分（MVP 簡化）。
  - `short_text`：大小寫不敏感、去前後空白，完全相同得分。
  - `numeric`：允許 ±ε（預設 0）。
