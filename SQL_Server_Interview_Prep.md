# SQL Server Interview Prep — 4.5 Hour Plan

A condensed, interview-focused study guide covering 30 SQL Server topics across three
90-minute sessions. Each topic follows the same shape: definition, why it exists, a small
example, likely interview questions, and the common trap.

---

## 3-Day Timed Study Plan

### Day 1 — Language & Querying (90 min)

| Minutes | Block | Topics |
|---|---|---|
| 0–10 | Warm-up | Core SQL syntax: DDL/DML/DQL/DCL/TCL |
| 10–22 | Joins | INNER / LEFT / RIGHT / FULL / CROSS / SELF |
| 22–35 | Data types | All essentials + NVARCHAR vs VARCHAR vs CHAR |
| 35–45 | String functions | CHARINDEX + "pipe index" resolved |
| 45–58 | Aggregation | GROUP BY + HAVING + logical query order |
| 58–68 | Duplicates | Find + delete duplicates |
| 68–83 | Window functions | ROW_NUMBER, RANK, DENSE_RANK, LAG/LEAD, OVER |
| 83–90 | Quiz | 10 rapid questions |

### Day 2 — Objects & Indexes (90 min)

| Minutes | Block | Topics |
|---|---|---|
| 0–8 | T-SQL programming | Variables, IF, WHILE, TRY/CATCH, batches |
| 8–18 | Temp tables | #temp, ##global, @table variable, CTE |
| 18–40 | Indexes (heavy) | Index concept, clustered, nonclustered, columnstore |
| 40–55 | Stored procedures | Create, params, output, execute |
| 55–68 | Functions & UDF | Scalar, inline TVF, multi-statement TVF |
| 68–82 | Triggers + magic tables | AFTER, INSTEAD OF, INSERTED/DELETED |
| 82–90 | Quiz | 10 rapid questions |

### Day 3 — Performance & Admin (90 min)

| Minutes | Block | Topics |
|---|---|---|
| 0–15 | Execution plan | Seek vs scan, key lookup, joins |
| 15–30 | SP optimization | SARGability, parameter sniffing, NOCOUNT |
| 30–40 | SSMS + Generate Scripts | Navigation, must-know actions |
| 40–50 | SQL Server Agent Jobs | Job/step/schedule, msdb |
| 50–58 | MDF / NDF / LDF | File architecture, filegroups |
| 58–70 | Log shipping vs Replication | Comparison-driven |
| 70–78 | Linked Server | Four-part names, OPENQUERY |
| 78–86 | JDBC | Driver, URL, PreparedStatement |
| 86–90 | Quiz | 10 rapid questions |

---

# Day 1 — Language & Querying

## 1. Core SQL Syntax

SQL splits into five command families.

| Family | Full form | Commands | Auto-commit? |
|---|---|---|---|
| DDL | Data Definition | `CREATE`, `ALTER`, `DROP`, `TRUNCATE` | Yes |
| DML | Data Manipulation | `INSERT`, `UPDATE`, `DELETE`, `MERGE` | No |
| DQL | Data Query | `SELECT` | N/A |
| DCL | Data Control | `GRANT`, `REVOKE`, `DENY` | Yes |
| TCL | Transaction Control | `BEGIN TRAN`, `COMMIT`, `ROLLBACK`, `SAVE TRAN` | N/A |

```sql
CREATE TABLE Employees (
    EmpID       INT IDENTITY(1,1) PRIMARY KEY,
    FirstName   VARCHAR(50)   NOT NULL,
    LastName    VARCHAR(50)   NOT NULL,
    Email       NVARCHAR(100) NULL,
    Salary      DECIMAL(10,2) NOT NULL DEFAULT 0,
    DeptID      INT           NULL,
    HireDate    DATE          NOT NULL DEFAULT GETDATE()
);

INSERT INTO Employees (FirstName, LastName, Salary, DeptID)
VALUES ('Asha', 'Rao', 50000, 1);

UPDATE Employees SET Salary = Salary * 1.10 WHERE DeptID = 1;
DELETE FROM Employees WHERE EmpID = 5;

SELECT FirstName, Salary
FROM   Employees
WHERE  Salary > 40000
ORDER  BY Salary DESC;
```

### DELETE vs TRUNCATE vs DROP

| | DELETE | TRUNCATE | DROP |
|---|---|---|---|
| Type | DML | DDL | DDL |
| WHERE clause | Yes | No | No |
| Logging | Row-by-row | Minimal (page deallocation) | Minimal |
| Resets IDENTITY | No | Yes | N/A |
| Fires triggers | Yes | No | No |
| Rollback in transaction | Yes | Yes (in SQL Server) | Yes |
| Keeps structure | Yes | Yes | No |

**Interview Q&A**

- *Is TRUNCATE rollback-able?* Yes in SQL Server inside an explicit transaction. Page
  deallocations are logged, so `ROLLBACK` works.
- *WHERE vs HAVING?* WHERE filters rows before grouping; HAVING filters groups after
  `GROUP BY` and can use aggregates.
- *UNION vs UNION ALL?* `UNION` removes duplicates and sorts; `UNION ALL` keeps everything
  and is faster.

**Trap:** Claiming TRUNCATE cannot be rolled back.

---

## 2. Joins

```sql
-- INNER: only matching rows from both sides
SELECT e.FirstName, d.DeptName
FROM   Employees e
INNER  JOIN Departments d ON e.DeptID = d.DeptID;

-- LEFT: all employees, dept NULL if none
SELECT e.FirstName, d.DeptName
FROM   Employees e
LEFT   JOIN Departments d ON e.DeptID = d.DeptID;

-- SELF JOIN: employee and their manager
SELECT e.FirstName AS Employee, m.FirstName AS Manager
FROM   Employees e
LEFT   JOIN Employees m ON e.ManagerID = m.EmpID;
```

| Join | Returns |
|---|---|
| `INNER JOIN` | Only rows matching in both tables |
| `LEFT JOIN` | All left rows + matches (NULLs where no match) |
| `RIGHT JOIN` | All right rows + matches |
| `FULL OUTER JOIN` | All rows from both, NULLs where no match |
| `CROSS JOIN` | Cartesian product |
| `SELF JOIN` | Table joined to itself using aliases |

**Interview Q&A**

- *Employees with no department?* `LEFT JOIN Departments d ... WHERE d.DeptID IS NULL` —
  the anti-join pattern.
- *Filter in `ON` vs `WHERE` for a LEFT JOIN?* In `ON` the unmatched left rows survive; in
  `WHERE` the same condition silently converts the LEFT JOIN into an INNER JOIN.
- *What is CROSS APPLY?* A per-row join to a table-valued function or correlated subquery.
  `CROSS APPLY` behaves like an inner join, `OUTER APPLY` like a left join. Classic use:
  top-N-per-group.

**Trap:** Putting `AND d.IsActive = 1` in the `WHERE` of a LEFT JOIN and losing unmatched rows.

---

## 3. Data Types

**Exact numeric**

| Type | Size | Notes |
|---|---|---|
| `TINYINT` | 1 byte | 0 to 255, no negatives |
| `SMALLINT` | 2 bytes | ±32,767 |
| `INT` | 4 bytes | ±2.14 billion — default choice |
| `BIGINT` | 8 bytes | ±9.2 quintillion |
| `DECIMAL(p,s)` / `NUMERIC(p,s)` | 5–17 bytes | Exact — use for money |
| `MONEY` / `SMALLMONEY` | 8 / 4 bytes | Legacy; prefer `DECIMAL(19,4)` |
| `BIT` | 1 bit | 0, 1, NULL |

**Approximate numeric**

| Type | Size | Notes |
|---|---|---|
| `FLOAT(n)` | 4 or 8 bytes | Approximate — never for money |
| `REAL` | 4 bytes | Equals `FLOAT(24)` |

**Date & time**

| Type | Size | Notes |
|---|---|---|
| `DATE` | 3 bytes | Date only |
| `TIME(n)` | 3–5 bytes | Time only |
| `DATETIME` | 8 bytes | Legacy, ~3.33 ms accuracy |
| `DATETIME2(n)` | 6–8 bytes | Preferred; 100 ns precision |
| `SMALLDATETIME` | 4 bytes | Minute precision |
| `DATETIMEOFFSET` | 8–10 bytes | Includes timezone offset |

**Character**

| Type | Storage | Notes |
|---|---|---|
| `CHAR(n)` | Fixed n bytes | Space-padded; fixed-length codes only |
| `VARCHAR(n)` | Actual + 2 bytes | Non-Unicode, max 8000 |
| `VARCHAR(MAX)` | Up to 2 GB | Off-row when large |
| `NCHAR(n)` | Fixed 2n bytes | Unicode fixed |
| `NVARCHAR(n)` | 2 bytes/char + 2 | Unicode, max 4000 |
| `TEXT` / `NTEXT` | — | Deprecated |

**Binary & other**

| Type | Notes |
|---|---|
| `BINARY(n)` / `VARBINARY(n)` | Raw bytes; `VARBINARY(MAX)` for files |
| `UNIQUEIDENTIFIER` | 16-byte GUID |
| `XML` | Native XML with XQuery |
| `ROWVERSION` / `TIMESTAMP` | Row-version binary, not a date |
| `GEOGRAPHY` / `HIERARCHYID` | Spatial / tree structures |

**Interview Q&A**

- *`CHAR(10)` vs `VARCHAR(10)` for 'IN'?* CHAR always uses 10 bytes and pads; VARCHAR uses
  2 + 2. Use `CHAR(2)` for a country code, VARCHAR for names.
- *Why never FLOAT for money?* Binary approximation means 0.1 is inexact and sums drift.
- *What is `DECIMAL(10,2)`?* 10 total digits, 2 after the point — max 99,999,999.99.

**Trap:** `TIMESTAMP` is a row version, not a time value. Use `DATETIME2`.

---

## 4. NVARCHAR and Unicode

```sql
DECLARE @eng VARCHAR(50)  = 'Hello';
DECLARE @hin NVARCHAR(50) = N'नमस्ते';   -- N'' prefix is mandatory

SELECT DATALENGTH(@eng),   -- 5 bytes
       DATALENGTH(@hin),   -- 12 bytes (2 per char)
       LEN(@hin);          -- 6 characters
```

| | VARCHAR | NVARCHAR |
|---|---|---|
| Encoding | Non-Unicode code page | Unicode UCS-2/UTF-16 |
| Bytes per char | 1 | 2 |
| Max declared length | 8000 | 4000 |
| Literal prefix | `'text'` | `N'text'` |

**Interview Q&A**

- *Why the `N` prefix?* Without it the literal is parsed as VARCHAR first, so non-Unicode
  characters become `?` before reaching the column.
- *Cost of NVARCHAR?* Double storage, more pages, more I/O, larger indexes.
- *Can VARCHAR store Unicode?* Yes, from SQL Server 2019 with a UTF-8 collation, often
  smaller than NVARCHAR for mostly-Latin data.

**Trap:** Comparing a VARCHAR column to an NVARCHAR parameter causes an implicit conversion
on the column, which kills index seeks.

---

## 5. CHARINDEX and String Functions

```sql
DECLARE @email VARCHAR(100) = 'asha.rao@company.com';

SELECT CHARINDEX('@', @email)                             AS AtPosition;  -- 9
SELECT LEFT(@email, CHARINDEX('@', @email) - 1)           AS UserName;    -- asha.rao
SELECT SUBSTRING(@email, CHARINDEX('@', @email) + 1, 100) AS Domain;      -- company.com
SELECT CHARINDEX('xyz', @email)                           AS NotFound;    -- 0
```

| Function | Purpose |
|---|---|
| `LEN()` | Character count, ignores trailing spaces |
| `DATALENGTH()` | Byte count, counts trailing spaces |
| `SUBSTRING(s, start, len)` | Extract part |
| `LEFT()` / `RIGHT()` | Extract from either end |
| `REPLACE(s, old, new)` | Substitute text |
| `LTRIM` / `RTRIM` / `TRIM` | Remove spaces |
| `CONCAT()` / `CONCAT_WS()` | Join strings, NULL-safe |
| `PATINDEX('%pat%', s)` | Like CHARINDEX with wildcards |
| `STRING_SPLIT(s, delim)` | Split to rows (2016+) |
| `STRING_AGG(col, delim)` | Join rows to one string (2017+) |
| `STUFF()` | Delete and insert at a position |

**Interview Q&A**

- *CHARINDEX vs PATINDEX?* CHARINDEX takes a plain substring plus an optional start
  position; PATINDEX accepts wildcard patterns but no start position.
- *LEN vs DATALENGTH?* `LEN('abc   ')` is 3; `DATALENGTH('abc   ')` is 6.
- *Return value when not found?* `0`, not -1 and not NULL.

**Trap:** `WHERE CHARINDEX('x', Name) > 0` is non-SARGable. Prefer `LIKE 'x%'` when the
match can be anchored at the start.

---

## 6. "Pipe Index" — Resolved

There is no index type called a pipe index in SQL Server. The likely intended meaning:

| Possible meaning | What it actually is |
|---|---|
| Filtered index | A nonclustered index with a `WHERE` clause — most likely answer |
| Pipe `\|\|` operator | String concatenation in Oracle/PostgreSQL; SQL Server uses `+` |
| `PIVOT` | T-SQL operator turning rows into columns |
| Pipeline / batch mode | Columnstore execution concept |

```sql
CREATE NONCLUSTERED INDEX IX_Orders_Pending
ON Orders (OrderDate, CustomerID)
WHERE Status = 'Pending';   -- filtered index
```

```sql
SELECT DeptID, [2023], [2024]
FROM   (SELECT DeptID, YEAR(HireDate) AS Yr, EmpID FROM Employees) src
PIVOT  (COUNT(EmpID) FOR Yr IN ([2023], [2024])) pv;
```

**Line to use:** the real index types are clustered, nonclustered, columnstore, filtered,
unique, XML, spatial, and full-text. An index over a subset of rows is a filtered index.

**Trap:** Inventing an answer instead of correcting the term.

---

## 7. GROUP BY and HAVING

```sql
SELECT   DeptID,
         COUNT(*)    AS EmpCount,
         AVG(Salary) AS AvgSalary,
         MAX(Salary) AS MaxSalary
FROM     Employees
WHERE    HireDate >= '2020-01-01'   -- filters ROWS first
GROUP BY DeptID
HAVING   COUNT(*) > 5               -- filters GROUPS after
ORDER BY AvgSalary DESC;
```

Logical processing order:

```
FROM → ON → JOIN → WHERE → GROUP BY → HAVING → SELECT → DISTINCT → ORDER BY → TOP/OFFSET
```

That order explains why a SELECT alias is unusable in `WHERE` but usable in `ORDER BY`.

**Interview Q&A**

- *WHERE vs HAVING?* WHERE filters rows pre-grouping and cannot contain aggregates; HAVING
  filters groups post-aggregation. Prefer WHERE when both work.
- *HAVING without GROUP BY?* Yes — the whole table becomes one group.
- *Does COUNT(*) count NULLs?* Yes. `COUNT(Column)` ignores NULLs, as do `SUM` and `AVG`.

**Trap:** A non-aggregated SELECT column missing from `GROUP BY` is an error in SQL Server.

---

## 8. Finding Duplicates

```sql
-- Find duplicate values and counts
SELECT   Email, COUNT(*) AS DupCount
FROM     Employees
GROUP BY Email
HAVING   COUNT(*) > 1;

-- Show the full duplicate rows
WITH cte AS (
    SELECT *,
           ROW_NUMBER() OVER (PARTITION BY Email ORDER BY EmpID) AS rn
    FROM   Employees
)
SELECT * FROM cte WHERE rn > 1;

-- Delete duplicates, keep the lowest EmpID
WITH cte AS (
    SELECT EmpID,
           ROW_NUMBER() OVER (PARTITION BY Email ORDER BY EmpID) AS rn
    FROM   Employees
)
DELETE FROM cte WHERE rn > 1;
```

Multi-column duplicates just extend the partition:
`PARTITION BY FirstName, LastName, DeptID`.

**Interview Q&A**

- *Delete duplicates keeping one row?* `ROW_NUMBER()` in a CTE, then `DELETE FROM cte WHERE rn > 1`.
- *No unique ID column?* Use `ORDER BY (SELECT NULL)` — `ROW_NUMBER` manufactures the tiebreaker.
- *Why not DISTINCT?* It dedupes the result set but does not remove rows or report counts.

**Trap:** `DELETE FROM Employees WHERE rn > 1` fails — `rn` only exists inside the CTE.

---

## 9. Window Functions

```sql
SELECT EmpID, FirstName, DeptID, Salary,

       ROW_NUMBER() OVER (PARTITION BY DeptID ORDER BY Salary DESC) AS RowNum,
       RANK()       OVER (PARTITION BY DeptID ORDER BY Salary DESC) AS Rnk,
       DENSE_RANK() OVER (PARTITION BY DeptID ORDER BY Salary DESC) AS DenseRnk,
       NTILE(4)     OVER (ORDER BY Salary DESC)                     AS Quartile,

       SUM(Salary) OVER (PARTITION BY DeptID)                       AS DeptTotal,
       SUM(Salary) OVER (ORDER BY EmpID
                         ROWS BETWEEN UNBOUNDED PRECEDING
                                  AND CURRENT ROW)                  AS RunningTotal,

       LAG(Salary, 1)  OVER (ORDER BY EmpID)                        AS PrevSalary,
       LEAD(Salary, 1) OVER (ORDER BY EmpID)                        AS NextSalary,
       FIRST_VALUE(Salary) OVER (PARTITION BY DeptID
                                 ORDER BY Salary DESC)              AS TopDeptSalary
FROM   Employees;
```

Ranking behaviour with salaries 100, 90, 90, 80:

| Salary | ROW_NUMBER | RANK | DENSE_RANK |
|---|---|---|---|
| 100 | 1 | 1 | 1 |
| 90 | 2 | 2 | 2 |
| 90 | 3 | 2 | 2 |
| 80 | 4 | 4 (gap) | 3 (no gap) |

Anatomy: `OVER (PARTITION BY <reset groups> ORDER BY <sequence> <frame>)`.

**Interview Q&A**

- *2nd highest salary per department?* `DENSE_RANK() OVER (PARTITION BY DeptID ORDER BY
  Salary DESC) = 2` filtered outside a CTE.
- *RANK vs DENSE_RANK?* Both tie equally; RANK skips numbers, DENSE_RANK does not.
- *ROWS vs RANGE?* ROWS counts physical rows; RANGE groups equal ORDER BY values. The
  default frame is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`, which breaks
  running totals on ties — always write `ROWS` explicitly.

**Trap:** Window functions cannot appear in `WHERE`; wrap them in a CTE or subquery.

---

## Day 1 Quiz

1. Which command resets the IDENTITY seed: DELETE or TRUNCATE?
2. What does `CHARINDEX('@', 'ab@cd')` return?
3. `LEFT JOIN` plus `WHERE right.col = 'X'` — what does the join become?
4. How many bytes does `NVARCHAR(10)` use to store 'Hi'?
5. Write the logical processing order of a SELECT.
6. `RANK()` on 10, 10, 9 — what are the ranks?
7. FLOAT or DECIMAL for currency, and why?
8. Can `HAVING` be used without `GROUP BY`?
9. What does `COUNT(ColumnName)` do with NULLs?
10. Is "pipe index" a real SQL Server object?

**Answers**

1. TRUNCATE.
2. 3.
3. An INNER JOIN.
4. 4 bytes of data plus 2 bytes of length overhead.
5. FROM → ON → JOIN → WHERE → GROUP BY → HAVING → SELECT → DISTINCT → ORDER BY → TOP.
6. 1, 1, 3.
7. DECIMAL — FLOAT is approximate and accumulates rounding error.
8. Yes; the whole result is one group.
9. Ignores them.
10. No. Most likely a filtered index.

---

# Day 2 — Objects & Indexes

## 10. T-SQL Programming Syntax

```sql
DECLARE @EmpCount INT,
        @Name     NVARCHAR(50) = N'Asha';

SET    @EmpCount = (SELECT COUNT(*) FROM Employees);
SELECT @EmpCount = COUNT(*) FROM Employees;

IF @EmpCount > 100
    PRINT 'Large team';
ELSE IF @EmpCount > 10
    PRINT 'Medium team';
ELSE
    PRINT 'Small team';

DECLARE @i INT = 1;
WHILE @i <= 5
BEGIN
    PRINT @i;
    SET @i += 1;
    IF @i = 4 CONTINUE;
    IF @i = 9 BREAK;
END

SELECT FirstName,
       CASE WHEN Salary > 80000 THEN 'High'
            WHEN Salary > 40000 THEN 'Mid'
            ELSE 'Entry'
       END AS Band
FROM Employees;

BEGIN TRY
    BEGIN TRANSACTION;
        UPDATE Accounts SET Balance = Balance - 100 WHERE AcctID = 1;
        UPDATE Accounts SET Balance = Balance + 100 WHERE AcctID = 2;
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    SELECT ERROR_NUMBER(), ERROR_MESSAGE(), ERROR_LINE(), ERROR_SEVERITY();
    THROW;
END CATCH
```

| Item | Meaning |
|---|---|
| `@@ROWCOUNT` | Rows affected by the last statement |
| `@@TRANCOUNT` | Open transaction nesting level |
| `SCOPE_IDENTITY()` | Last identity in current scope — the safe one |
| `@@IDENTITY` | Last identity in session — can come from a trigger |
| `GO` | SSMS batch separator, not T-SQL |

**Interview Q&A**

- *SET vs SELECT for assignment?* SET is ANSI and errors on multiple rows. SELECT assigns
  several variables at once and leaves the variable unchanged when no rows return.
- *SCOPE_IDENTITY vs @@IDENTITY?* `@@IDENTITY` can return an identity generated by a
  trigger in another table. Always use `SCOPE_IDENTITY()`.
- *What is a batch?* Statements sent together, separated by `GO`. Variables do not cross batches.

**Trap:** Using a variable after `GO` — it no longer exists.

---

## 11. Temporary Tables

```sql
-- LOCAL temp table
CREATE TABLE #HighEarners (EmpID INT PRIMARY KEY, Salary DECIMAL(10,2));
INSERT INTO #HighEarners SELECT EmpID, Salary FROM Employees WHERE Salary > 80000;
DROP TABLE #HighEarners;

-- SELECT INTO shortcut
SELECT EmpID, Salary INTO #Temp2 FROM Employees WHERE DeptID = 1;

-- GLOBAL temp table
CREATE TABLE ##SharedTemp (ID INT);

-- Table variable
DECLARE @Emp TABLE (EmpID INT PRIMARY KEY, Salary DECIMAL(10,2));

-- CTE
WITH HighEarners AS (
    SELECT EmpID, Salary FROM Employees WHERE Salary > 80000
)
SELECT * FROM HighEarners;
```

| | `#Temp` | `@TableVariable` | CTE |
|---|---|---|---|
| Stored in | tempdb | tempdb | Nothing — inlined |
| Scope | Session / procedure | Batch only | One statement |
| Statistics | Yes | No (assumes 1 row) | N/A |
| Indexes | Any, added later | Inline only | No |
| Rolled back | Yes | No | N/A |
| Best for | Large row counts | Small sets | Readability, recursion |
| Recursion | No | No | Yes |

```sql
WITH OrgChart AS (
    SELECT EmpID, FirstName, ManagerID, 1 AS Lvl
    FROM   Employees WHERE ManagerID IS NULL       -- anchor
    UNION ALL
    SELECT e.EmpID, e.FirstName, e.ManagerID, oc.Lvl + 1
    FROM   Employees e
    JOIN   OrgChart oc ON e.ManagerID = oc.EmpID   -- recursive part
)
SELECT * FROM OrgChart OPTION (MAXRECURSION 100);
```

**Interview Q&A**

- *Which performs better?* Table variables for small sets; temp tables for larger sets
  because statistics produce better plans.
- *Is a table variable in memory?* No — it also lives in tempdb.
- *`#` vs `##`?* Local to the session versus global across sessions.

**Trap:** Table variables survive a `ROLLBACK`.

---

## 12. Index Fundamentals

```sql
CREATE NONCLUSTERED INDEX IX_Employees_DeptID
ON Employees (DeptID)
INCLUDE (FirstName, Salary);   -- covering index

DROP  INDEX IX_Employees_DeptID ON Employees;
ALTER INDEX IX_Employees_DeptID ON Employees REBUILD;      -- >30% fragmentation
ALTER INDEX IX_Employees_DeptID ON Employees REORGANIZE;   -- 5–30%
```

Analogy: a book index. Without one, finding a term means reading every page (table scan).
With one, you jump straight to the page (index seek).

| Type | Note |
|---|---|
| Clustered | Sorts the table itself. One per table |
| Nonclustered | Separate structure with pointers. Up to 999 |
| Unique | Enforces uniqueness |
| Filtered | Has a `WHERE` clause |
| Columnstore | Column-wise, for analytics |
| Covering | A nonclustered index with `INCLUDE` satisfying the whole query |

**Interview Q&A**

- *Do indexes ever hurt?* Yes — every write maintains every affected index.
- *What is a covering index?* One containing every column the query needs, eliminating lookups.
- *Key vs INCLUDE columns?* Key columns are sorted and seekable; INCLUDE columns sit at the
  leaf only and do not count toward the key size limit.

**Trap:** Composite index column order matters. `(DeptID, Salary)` barely helps a query
filtering on `Salary` alone.

---

## 13. Clustered Index

```sql
CREATE CLUSTERED INDEX CIX_Employees_EmpID ON Employees (EmpID);

CREATE TABLE Employees (
    EmpID INT IDENTITY PRIMARY KEY   -- implicitly clustered
);
```

- One per table, because rows have exactly one physical order.
- Leaf level is the data itself.
- No clustered index means the table is a **heap**.
- Ideal key: narrow, unique, static, ever-increasing.

**Interview Q&A**

- *Why only one?* It dictates physical row order.
- *Is PRIMARY KEY the same thing?* No. PK is a constraint; the clustered index is storage.
  SQL Server makes the PK clustered by default, but that is changeable.
- *Why is a GUID a poor clustering key?* 16 bytes wide and random, causing page splits and
  fragmentation. Every nonclustered index also carries it as the row locator.

**Trap:** Claiming heaps are generally faster.

---

## 14. Nonclustered Index

```sql
CREATE NONCLUSTERED INDEX IX_Employees_LastName
ON Employees (LastName)
INCLUDE (FirstName, Email);
```

| Base table | Leaf points via |
|---|---|
| Heap | RID (File:Page:Slot) |
| Clustered table | The clustered index key |

A **key lookup** happens when the nonclustered index lacks a requested column and SQL
Server must visit the clustered index. Fix it with `INCLUDE`.

| | Clustered | Nonclustered |
|---|---|---|
| Per table | 1 | Up to 999 |
| Leaf holds | Actual rows | Key + row locator |
| Extra storage | No | Yes |
| Lookup needed | No | Yes, unless covering |

**Interview Q&A**

- *What is a key lookup and how is it removed?* An extra fetch from the clustered index;
  add the missing columns with `INCLUDE`.
- *How many nonclustered indexes?* Typically five or fewer on write-heavy OLTP tables.
  Drop unused ones using `sys.dm_db_index_usage_stats`.
- *What is fragmentation?* Logical page order diverging from physical order. Under 5%
  ignore, 5–30% reorganize, over 30% rebuild.

**Trap:** Blindly applying every missing-index recommendation.

---

## 15. Columnstore Index

```sql
CREATE CLUSTERED COLUMNSTORE INDEX CCI_Sales ON Sales;

CREATE NONCLUSTERED COLUMNSTORE INDEX NCCI_Sales
ON Sales (SaleDate, ProductID, Amount);
```

Why it is fast: column elimination, ~10x compression, rowgroup (segment) elimination, and
batch mode execution.

| | Rowstore | Columnstore |
|---|---|---|
| Storage | Row by row | Column by column |
| Best for | OLTP point lookups | OLAP aggregates |
| Compression | Low | Very high |
| Execution | Row mode | Batch mode |

**Interview Q&A**

- *Clustered vs nonclustered columnstore?* Clustered replaces table storage entirely and is
  updatable; nonclustered adds a columnar copy beside the rowstore for HTAP.
- *Rowgroup and delta store?* Rows compress in rowgroups of ~1,048,576. Small inserts land
  in an uncompressed delta store until the tuple-mover compresses them.
- *When to avoid?* OLTP tables with frequent single-row lookups, or tables under ~1M rows.

**Trap:** Using a clustered columnstore on a constantly-updated transactional table.

---

## 16. Stored Procedures

```sql
CREATE PROCEDURE dbo.usp_GetEmployeesByDept
    @DeptID    INT,
    @MinSalary DECIMAL(10,2) = 0,   -- default value
    @RowCount  INT OUTPUT            -- output parameter
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        SELECT EmpID, FirstName, LastName, Salary
        FROM   dbo.Employees
        WHERE  DeptID = @DeptID
          AND  Salary >= @MinSalary;

        SET @RowCount = @@ROWCOUNT;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH

    RETURN 0;
END
GO

DECLARE @cnt INT;
EXEC dbo.usp_GetEmployeesByDept @DeptID = 1, @MinSalary = 40000, @RowCount = @cnt OUTPUT;
```

| | Stored Procedure | Function |
|---|---|---|
| Returns | Result sets, OUTPUT params | A value or table |
| Called from SELECT | No | Yes |
| DML | Yes | No |
| TRY/CATCH | Yes | No |
| Transactions | Yes | No |
| Dynamic SQL | Yes | No |

**Interview Q&A**

- *Why `SET NOCOUNT ON`?* Suppresses "rows affected" messages, removing network round-trips.
- *How do procedures prevent SQL injection?* Parameters are typed values, never concatenated
  — unless the procedure itself concatenates into dynamic SQL, so use `sp_executesql`.
- *Can a procedure return a table?* Not as a return value; `RETURN` yields an INT status.
  Use a TVF or `INSERT INTO #temp EXEC proc`.

**Trap:** The `sp_` prefix makes SQL Server search `master` first. Use `usp_`.

---

## 17. Functions and User-Defined Functions

```sql
-- Scalar UDF
CREATE FUNCTION dbo.fn_GetFullName (@First NVARCHAR(50), @Last NVARCHAR(50))
RETURNS NVARCHAR(101)
AS
BEGIN
    RETURN @First + ' ' + @Last;
END
GO

-- Inline table-valued function (best performance)
CREATE FUNCTION dbo.fn_EmployeesByDept (@DeptID INT)
RETURNS TABLE
AS
RETURN (SELECT EmpID, FirstName, Salary FROM Employees WHERE DeptID = @DeptID);
GO

-- Multi-statement table-valued function (slowest)
CREATE FUNCTION dbo.fn_EmpReport (@DeptID INT)
RETURNS @Result TABLE (EmpID INT, FullName NVARCHAR(101), Band VARCHAR(10))
AS
BEGIN
    INSERT INTO @Result
    SELECT EmpID, FirstName + ' ' + LastName,
           CASE WHEN Salary > 80000 THEN 'High' ELSE 'Normal' END
    FROM Employees WHERE DeptID = @DeptID;
    RETURN;
END
```

| | Scalar | Inline TVF | Multi-statement TVF |
|---|---|---|---|
| Returns | One value | Table (one SELECT) | Table (declared) |
| Performance | Poor, row-by-row | Best — expanded like a view | Poor — fixed row estimate |
| Parallelism | Blocked pre-2019 | Allowed | Limited |

**Interview Q&A**

- *Why are scalar UDFs slow?* They run once per row, historically blocked parallelism, and
  hide their cost in the plan. SQL Server 2019 inlines many under compatibility level 150.
- *ISNULL vs COALESCE?* ISNULL takes 2 arguments and returns the first argument's type;
  COALESCE is ANSI, takes many, and uses type precedence.
- *Can a function modify data?* No — only table variables declared inside it.

**Trap:** Scalar UDFs require the schema prefix: `dbo.fn_GetFullName(...)`.

---

## 18. Triggers and Magic Tables

```sql
CREATE TRIGGER trg_Employees_Audit
ON dbo.Employees
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Action VARCHAR(10) =
        CASE WHEN EXISTS (SELECT 1 FROM INSERTED) AND EXISTS (SELECT 1 FROM DELETED) THEN 'UPDATE'
             WHEN EXISTS (SELECT 1 FROM INSERTED)                                    THEN 'INSERT'
             ELSE 'DELETE' END;

    INSERT INTO EmployeeAudit (EmpID, OldSalary, NewSalary, Action, ChangedOn, ChangedBy)
    SELECT COALESCE(i.EmpID, d.EmpID), d.Salary, i.Salary, @Action, GETDATE(), SUSER_SNAME()
    FROM   INSERTED i
    FULL OUTER JOIN DELETED d ON i.EmpID = d.EmpID;
END
GO

CREATE TRIGGER trg_vwEmployees_Insert
ON dbo.vwEmployees
INSTEAD OF INSERT
AS
BEGIN
    INSERT INTO Employees (FirstName, LastName) SELECT FirstName, LastName FROM INSERTED;
END
```

| Operation | `INSERTED` holds | `DELETED` holds |
|---|---|---|
| INSERT | New rows | Empty |
| DELETE | Empty | Removed rows |
| UPDATE | New values | Old values |

Magic tables exist only inside trigger scope, live in tempdb, and are read-only.

| Type | Fires |
|---|---|
| `AFTER` / `FOR` | After the DML completes; tables only |
| `INSTEAD OF` | Replaces the DML; tables and views |
| DDL trigger | On CREATE/ALTER/DROP, uses `EVENTDATA()` |
| LOGON trigger | On session login |

**Interview Q&A**

- *Per row or per statement?* Per statement. A 500-row update fires once with 500 rows in
  `INSERTED`.
- *Old and new values on UPDATE?* Join `DELETED` to `INSERTED` on the primary key.
- *Does TRUNCATE fire a DELETE trigger?* No — TRUNCATE is DDL.

**Trap:** `SELECT @EmpID = EmpID FROM INSERTED` grabs one arbitrary row in a multi-row update.

---

## Day 2 Quiz

1. How many clustered indexes can a table have, and why?
2. What are the two magic tables and what does each hold during an UPDATE?
3. Can a stored procedure be called inside a `SELECT`?
4. Table variable or temp table — which has statistics?
5. What is a key lookup?
6. Which UDF type performs best?
7. Does a trigger fire per row or per statement?
8. What is a table without a clustered index called?
9. Why avoid the `sp_` prefix?
10. Which index type suits a 500-million-row reporting fact table?

**Answers**

1. One — it defines physical row order.
2. `INSERTED` (new values) and `DELETED` (old values).
3. No.
4. Temp table.
5. A nonclustered seek followed by a trip to the clustered index for missing columns.
6. Inline table-valued function.
7. Per statement.
8. A heap.
9. SQL Server searches `master` first, adding overhead and collision risk.
10. Clustered columnstore index.

---

# Day 3 — Performance & Admin

## 19. Execution Plan

| Action | Shortcut |
|---|---|
| Estimated plan (no execution) | `Ctrl + L` |
| Include actual plan | `Ctrl + M`, then execute |
| Text statistics | `SET STATISTICS IO ON; SET STATISTICS TIME ON;` |

| Operator | Means | Good/bad |
|---|---|---|
| Clustered Index Seek | Direct navigation | Best |
| Index Seek (NonClustered) | Seek on a secondary index | Good |
| Index Scan | Reads the whole index | Bad for narrow filters |
| Table Scan | Reads the entire heap | Usually bad |
| Key Lookup / RID Lookup | Extra trip for missing columns | Fix with `INCLUDE` |
| Nested Loops | Join with small outer input | Good when one side is small |
| Hash Match | Builds a hash table | Memory-hungry |
| Merge Join | Both inputs pre-sorted | Efficient when sorted |
| Sort | Explicit sort | Often removable via an index |

Read plans right to left, top to bottom. Thick arrows mean many rows. Compare actual versus
estimated row counts; large gaps point to stale statistics or bad parameter estimates.

**Interview Q&A**

- *Estimated vs actual plan?* Estimated comes from the optimizer without running the query;
  actual adds real row counts, execution counts, and runtime warnings.
- *Seek vs scan?* A seek navigates the B-tree to qualifying rows; a scan reads every leaf
  page. A scan is correct when the query returns most of the table.
- *Estimated 1 row, actual 500,000 — meaning?* Bad cardinality estimation from stale
  statistics, a non-SARGable predicate, a table variable, or parameter sniffing.

**Trap:** Chasing the highest cost-percentage operator. Those are estimates; trust actual
row counts and logical reads.

---

## 20. Stored Procedure Optimization

```sql
-- 1.  SET NOCOUNT ON
-- 2.  Schema-qualify: dbo.Employees
-- 3.  Never SELECT *
-- 4.  Keep predicates SARGable:
        WHERE YEAR(HireDate) = 2024                                 -- BAD
        WHERE HireDate >= '2024-01-01' AND HireDate < '2025-01-01'  -- GOOD
-- 5.  Avoid scalar UDFs in WHERE/SELECT
-- 6.  Replace cursors and WHILE loops with set-based SQL
-- 7.  Index WHERE / JOIN / ORDER BY columns
-- 8.  Avoid implicit conversions
-- 9.  Use EXISTS instead of COUNT(*) > 0
-- 10. Use UNION ALL when duplicates are impossible
-- 11. Break giant queries into #temp steps
-- 12. Keep transactions short
-- 13. Update statistics and rebuild fragmented indexes on a schedule
```

**Parameter sniffing:** SQL Server caches a plan built for the first execution's parameter
values; later executions with different values may reuse a poor plan.

```sql
OPTION (RECOMPILE)
OPTION (OPTIMIZE FOR (@DeptID = 5))
OPTION (OPTIMIZE FOR UNKNOWN)
WITH RECOMPILE
```

**Interview Q&A**

- *What is SARGable?* Search-ARGument-able — satisfiable by an index seek. Functions on the
  column, leading wildcards, and implicit conversions all break it.
- *Was fast, now slow, code unchanged — why?* Parameter sniffing, stale statistics, index
  fragmentation, or data growth.
- *EXISTS vs COUNT(*)?* EXISTS short-circuits on the first match.

**Trap:** Answering only "add an index". Lead with reproduce, capture the actual plan, find
the biggest actual-row operator, then decide.

---

## 21. SSMS Essentials

| Where | What lives there |
|---|---|
| Object Explorer → Databases → *DB* | Tables, Views, Synonyms |
| → Programmability | Stored Procedures, Functions, Triggers |
| → Security | Users, Roles, Schemas |
| Table → Triggers / Indexes / Constraints | Per-table objects |
| Server → Security → Logins | Server-level logins |
| SQL Server Agent | Jobs, Alerts, Operators |
| Right-click DB → Tasks | Backup, Restore, Generate Scripts, Import/Export |
| Right-click server → Activity Monitor | Live sessions, waits, expensive queries |

| Key | Action |
|---|---|
| `F5` / `Ctrl+E` | Execute |
| `Ctrl+R` | Toggle results pane |
| `Ctrl+M` | Include actual execution plan |
| `Ctrl+L` | Display estimated plan |
| `Alt+F1` | Object info (`sp_help`) |
| `Ctrl+K, Ctrl+C` | Comment selection |
| `F8` | Object Explorer |

**Interview Q&A**

- *How do you back up a database?* Right-click DB → Tasks → Back Up. T-SQL equivalent:
  `BACKUP DATABASE MyDB TO DISK = 'D:\MyDB.bak' WITH INIT, COMPRESSION;`
- *Who is running what right now?* Activity Monitor, `sp_who2`, or `sys.dm_exec_requests`
  joined to `sys.dm_exec_sql_text`.
- *Script a table definition?* Right-click table → Script Table as → CREATE To.

**Trap:** Saying you only use the GUI. Every dialog has a Script button.

---

## 22. Generate Scripts in SSMS

1. Right-click the database → **Tasks** → **Generate Scripts...**
2. **Choose Objects**: whole database or specific objects.
3. **Set Scripting Options** → **Advanced**:
   - Types of data to script: `Schema only` / `Data only` / **`Schema and data`**
   - Script Indexes → True
   - Script Triggers → True
   - Script Primary Keys / Foreign Keys → True
   - Script DROP and CREATE → useful for redeploy
   - Script for Server Version → target a lower version if needed
4. **Output**: file, clipboard, or new query window.

**Interview Q&A**

- *Copy a table with data to another server?* Generate Scripts with "Schema and data". For
  large tables prefer the Import/Export Wizard, `bcp`, or backup/restore.
- *Why are indexes missing from my script?* The Advanced options default Script Indexes and
  Script Triggers to False in some versions.
- *Generate Scripts vs Backup/Restore?* Scripts are object-level, version-flexible, and
  source-control friendly; backup/restore moves the whole database far faster.

**Trap:** Leaving the default "Schema only" and getting empty tables.

---

## 23. SQL Server Agent Jobs

```
Job
 ├─ Step 1 (T-SQL / SSIS / PowerShell / CmdExec)
 ├─ Step 2
 ├─ Schedule  (daily, weekly, on Agent startup, on CPU idle)
 ├─ Alert
 └─ Notification → Operator (Database Mail)
```

```sql
EXEC msdb.dbo.sp_start_job @job_name = 'Nightly Backup';

SELECT j.name, h.run_date, h.run_time, h.run_status, h.message
FROM   msdb.dbo.sysjobs j
JOIN   msdb.dbo.sysjobhistory h ON j.job_id = h.job_id
ORDER  BY h.run_date DESC, h.run_time DESC;
```

All Agent metadata lives in **`msdb`**: `sysjobs`, `sysjobsteps`, `sysjobschedules`,
`sysjobhistory`.

**Interview Q&A**

- *Where is job metadata stored?* `msdb`.
- *A job failed — how do you troubleshoot?* View History down to the step level, read the
  message, check the step output file and the Agent error log, and verify permissions.
- *Is Agent available in Express Edition?* No. Use Windows Task Scheduler with `sqlcmd`.

**Trap:** The job runs as the Agent service account or a proxy, not as your login — so
permissions are the usual cause of "works for me but fails as a job".

---

## 24. MDF, NDF, and LDF Files

| Extension | Name | Count | Contains |
|---|---|---|---|
| `.mdf` | Primary data file | Exactly 1 | Startup info, system tables, user data |
| `.ndf` | Secondary data file | 0 to many (optional) | User data only |
| `.ldf` | Log file | 1 or more | Transaction log for recovery/rollback |

```sql
CREATE DATABASE SalesDB
ON PRIMARY
  ( NAME = SalesDB_Data, FILENAME = 'D:\Data\SalesDB.mdf',
    SIZE = 100MB, MAXSIZE = 10GB, FILEGROWTH = 100MB ),
FILEGROUP FG_Archive
  ( NAME = SalesDB_Arch, FILENAME = 'E:\Data\SalesDB_Arch.ndf',
    SIZE = 500MB, FILEGROWTH = 200MB )
LOG ON
  ( NAME = SalesDB_Log, FILENAME = 'F:\Log\SalesDB.ldf',
    SIZE = 50MB, FILEGROWTH = 50MB );

SELECT name, type_desc, physical_name, size/128.0 AS SizeMB FROM sys.database_files;
```

| Recovery model | Log behaviour | Point-in-time restore |
|---|---|---|
| Simple | Truncates automatically | No |
| Full | Kept until backed up | Yes |
| Bulk-logged | Minimal logging for bulk ops | Partial |

**Interview Q&A**

- *Can a database have zero NDF files?* Yes — they are optional.
- *Why is my LDF huge?* Full recovery model with no log backups, so the log never truncates.
- *What is a filegroup?* A logical container of data files that objects are created on.

**Trap:** Routinely shrinking data files causes fragmentation and the file grows back.

---

## 25. Log Shipping

```
PRIMARY                SHARED FOLDER            SECONDARY
   │                        │                       │
[Backup job] ──.trn──▶  \\share\logs  ──▶  [Copy job] ──▶ [Restore job]
```

| Secondary mode | Meaning |
|---|---|
| NORECOVERY | Inaccessible; accepts further log restores only |
| STANDBY | Read-only; users disconnected during each restore |

Requires Full or Bulk-logged recovery model. Configure via right-click primary DB →
Properties → Transaction Log Shipping.

**Interview Q&A**

- *Is failover automatic?* No — manual. Restore remaining logs `WITH RECOVERY` and repoint
  applications.
- *Log shipping vs mirroring vs Always On?* Log shipping is backup/copy/restore with manual
  failover and multiple secondaries. Mirroring is deprecated, single partner, automatic
  failover with a witness. Always On AG offers multiple readable replicas with automatic
  failover.
- *Data-loss window?* Equal to the backup + copy + restore interval, typically 15 minutes.

**Trap:** Running a manual `BACKUP LOG` outside the job breaks the log chain.

---

## 26. Replication

| Role | Meaning |
|---|---|
| Publisher | Source server |
| Article | A single replicated object |
| Publication | A collection of articles |
| Distributor | Stores metadata and moves changes |
| Subscriber | Destination server |
| Agents | Snapshot, Log Reader, Distribution, Merge |

| Type | How it works | Latency | Use case |
|---|---|---|---|
| Snapshot | Periodic full copy | High | Small, static lookup tables |
| Transactional | Log Reader ships committed transactions | Near real-time | Reporting offload |
| Merge | Bidirectional with conflict resolution | Varies | Field laptops syncing back |
| Peer-to-Peer | Multiple writable nodes | Low | Enterprise scale-out |

| | Log Shipping | Replication |
|---|---|---|
| Granularity | Whole database | Table / column / row subsets |
| Purpose | Disaster recovery | Data distribution |
| Secondary readable | Standby mode only | Yes |
| Secondary writable | No | Yes (merge / P2P) |
| Requires PK | No | Yes, for transactional |
| Latency | Minutes | Seconds |

**Interview Q&A**

- *Which type for near-real-time reporting?* Transactional.
- *Does transactional replication need a primary key?* Yes, on every published table.
- *Push vs pull subscription?* Push runs the Distribution Agent at the distributor; pull
  runs it at the subscriber, which scales better across many subscribers.

**Trap:** Calling replication a high-availability solution. It is data distribution.

---

## 27. Linked Server

```sql
EXEC sp_addlinkedserver
     @server     = 'SRV_REMOTE',
     @srvproduct = N'SQL Server';

EXEC sp_addlinkedsrvlogin
     @rmtsrvname  = 'SRV_REMOTE',
     @useself     = 'False',
     @rmtuser     = 'remoteUser',
     @rmtpassword = 'password';

-- Four-part name: Server.Database.Schema.Object
SELECT * FROM SRV_REMOTE.SalesDB.dbo.Orders;

-- OPENQUERY runs the query ON the remote server
SELECT * FROM OPENQUERY(SRV_REMOTE,
       'SELECT OrderID, Amount FROM SalesDB.dbo.Orders WHERE Amount > 1000');

SELECT * FROM sys.servers;
```

**Interview Q&A**

- *Four-part name vs OPENQUERY?* OPENQUERY is usually faster because filtering happens
  remotely and only results cross the network.
- *What are the four parts?* `LinkedServer.Database.Schema.Object`.
- *Distributed transactions?* MSDTC must run on both machines; use
  `BEGIN DISTRIBUTED TRANSACTION`.

**Trap:** Assuming linked-server queries perform like local ones.

> If the topic really meant the data structure: a **linked list** stores each value with a
> pointer to the next node — O(1) insert/delete, poor random access. Unrelated to SQL
> Server, though clustered index leaf pages are connected as a doubly-linked list.

---

## 28. JDBC Connection

```java
String url = "jdbc:sqlserver://localhost:1433;"
           + "databaseName=SalesDB;"
           + "user=sa;password=Secret123;"
           + "encrypt=true;trustServerCertificate=true;";

try (Connection conn = DriverManager.getConnection(url)) {

    String sql = "SELECT EmpID, FirstName FROM Employees WHERE DeptID = ?";
    try (PreparedStatement ps = conn.prepareStatement(sql)) {
        ps.setInt(1, 10);
        try (ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                System.out.println(rs.getInt("EmpID") + " " + rs.getString("FirstName"));
            }
        }
    }

    try (CallableStatement cs = conn.prepareCall("{call dbo.usp_GetEmployeesByDept(?, ?)}")) {
        cs.setInt(1, 10);
        cs.registerOutParameter(2, Types.INTEGER);
        cs.execute();
        int count = cs.getInt(2);
    }
}
```

| Piece | Note |
|---|---|
| Default port | 1433 |
| Named instance | `jdbc:sqlserver://host\\INSTANCE;...` (SQL Browser on UDP 1434) |
| Windows auth | `integratedSecurity=true` plus the native DLL |
| `encrypt=true` | Default since driver 10.x |

Driver types: Type 1 JDBC-ODBC bridge (removed), Type 2 native-API, Type 3 network
protocol, **Type 4 pure Java** — the Microsoft driver is Type 4.

**Interview Q&A**

- *Statement vs PreparedStatement?* PreparedStatement is precompiled, takes typed `?`
  parameters, is injection-safe, and enables plan reuse.
- *"TCP/IP connection to host failed" — how to debug?* Enable TCP/IP in Configuration
  Manager, open port 1433, run SQL Browser for named instances, enable mixed-mode auth, and
  verify host and port.
- *Why connection pooling?* Opening connections is expensive; pools like HikariCP reuse
  live connections.

**Trap:** Driver 10.x defaults `encrypt` to true, breaking older connection strings.

---

## Day 3 Quiz

1. Which SSMS shortcut includes the actual execution plan?
2. Which database file extension is optional?
3. Is log shipping failover automatic?
4. Which replication type gives near-real-time data?
5. Does transactional replication require a primary key?
6. What does SARGable mean?
7. What are the four parts of a linked server object name?
8. Which JDBC driver type is the Microsoft SQL Server driver?
9. Which system database stores Agent job metadata?
10. In Generate Scripts, which setting includes the data?

**Answers**

1. `Ctrl + M`.
2. `.ndf`.
3. No — manual.
4. Transactional.
5. Yes.
6. A predicate an index seek can satisfy.
7. `LinkedServer.Database.Schema.Object`.
8. Type 4, pure Java.
9. `msdb`.
10. Advanced → Types of data to script → Schema and data.

---

# Interview Cheat Sheet

| Topic | Must-say line |
|---|---|
| Stored Procedure | Precompiled T-SQL in the DB. Supports DML, transactions, TRY/CATCH, OUTPUT params. Not usable in a SELECT. Always `SET NOCOUNT ON`, never prefix `sp_`. |
| Function | Returns a value, usable inside a SELECT, side-effect free — no DML, no TRY/CATCH. |
| UDF | Scalar, inline TVF, multi-statement TVF. Inline TVF performs best. |
| Trigger | Fires automatically on DML. AFTER or INSTEAD OF. Once per statement, not per row. |
| Magic Tables | `INSERTED` and `DELETED`. On UPDATE: new and old values. Join on the PK. |
| Temp Table | `#local`, `##global`, both in tempdb. Has statistics, unlike a table variable. |
| Index | A B-tree that avoids full scans. Speeds reads, slows writes. |
| Clustered | Defines physical row order; leaf level is the data. One per table. None means heap. |
| Nonclustered | Separate structure with a pointer. Up to 999. `INCLUDE` makes it covering. |
| Columnstore | Column-wise, ~10x compression, batch mode. Analytics, not OLTP. |
| MDF/NDF/LDF | Primary data (1), secondary data (optional, many), transaction log. |
| CHARINDEX | 1-based position, 0 if absent. Non-SARGable in a WHERE clause. |
| Pipe Index | Not a SQL Server object. Likely a filtered index. |
| NVARCHAR | Unicode, 2 bytes/char, max 4000, needs the `N''` prefix. |
| Data Types | DECIMAL for money, DATETIME2 over DATETIME, TIMESTAMP is a row version. |
| SQL Syntax | DDL, DML, DQL, DCL, TCL. TRUNCATE is DDL, resets IDENTITY, still rollback-able. |
| T-SQL Syntax | Variables, IF/WHILE, TRY/CATCH. `GO` is a batch separator. Use `SCOPE_IDENTITY()`. |
| Window Functions | Compute across rows without collapsing them. Cannot be used in WHERE. |
| Duplicates | `GROUP BY ... HAVING COUNT(*) > 1` to find; `ROW_NUMBER()` CTE to delete. |
| GROUP BY / HAVING | WHERE filters rows, HAVING filters groups. |
| Jobs | SQL Server Agent. Metadata in `msdb`. Failures are usually permissions. |
| Log Shipping | Backup, copy, restore to a warm standby. Manual failover. Full recovery model. |
| Replication | Publisher / Distributor / Subscriber. Data distribution, not high availability. |
| JDBC | Type 4 driver. `jdbc:sqlserver://host:1433;databaseName=DB;encrypt=true`. |
| Generate Scripts | Tasks → Generate Scripts → Advanced → Schema and data. |
| SSMS | Object Explorer, Programmability, Activity Monitor. `F5`, `Ctrl+M`. |
| SP Optimization | NOCOUNT, SARGable predicates, no `SELECT *`, EXISTS over COUNT. |
| Execution Plan | `Ctrl+M`. Read right to left. Compare actual vs estimated rows. |
| Linked Server | `Server.DB.Schema.Table`. Prefer `OPENQUERY`. |

---

# Top 25 Interview Questions

1. **Clustered vs nonclustered index?** Clustered defines physical order and its leaf level
   is the data — one per table. Nonclustered is a separate structure whose leaf holds the
   key plus a pointer — up to 999 per table.
2. **Stored procedure vs function?** A procedure performs DML, manages transactions, uses
   TRY/CATCH and dynamic SQL, and returns result sets, but cannot be called from a SELECT.
   A function must return a value, is usable in a SELECT, and has no side effects.
3. **What are magic tables?** `INSERTED` and `DELETED`, available only inside a trigger.
4. **DELETE vs TRUNCATE?** DELETE is DML with WHERE, full logging, fires triggers, keeps the
   IDENTITY seed. TRUNCATE is DDL, minimal logging, skips triggers, resets IDENTITY, and is
   still rollback-able inside a transaction.
5. **How do you find duplicates?** `GROUP BY col HAVING COUNT(*) > 1`, or `ROW_NUMBER()` in
   a CTE filtered on `rn > 1`.
6. **WHERE vs HAVING?** WHERE filters rows before grouping; HAVING filters groups after.
7. **ROW_NUMBER vs RANK vs DENSE_RANK?** For 10, 10, 9: 1,2,3 / 1,1,3 / 1,1,2.
8. **Second highest salary?** `SELECT MAX(Salary) FROM Employees WHERE Salary < (SELECT
   MAX(Salary) FROM Employees);` or `DENSE_RANK() = 2` in a CTE.
9. **VARCHAR vs NVARCHAR?** Non-Unicode 1 byte/char max 8000, versus Unicode 2 bytes/char
   max 4000 with the `N''` prefix.
10. **CHAR vs VARCHAR?** Fixed-length space-padded versus variable-length with 2 bytes of
    overhead.
11. **Temp table vs table variable?** Both in tempdb. Temp tables have statistics, indexes,
    and participate in transactions; table variables do not.
12. **What is a CTE?** A named temporary result set defined with `WITH`, scoped to one
    statement, and the only construct supporting recursion.
13. **What is a covering index?** A nonclustered index containing every column the query
    needs, eliminating key lookups.
14. **What is a key lookup and how is it eliminated?** An extra fetch from the clustered
    index; add the missing columns as `INCLUDE`.
15. **What is parameter sniffing?** A cached plan built for the first execution's parameters
    performing badly for later ones. Mitigate with `RECOMPILE` or `OPTIMIZE FOR`.
16. **How do you troubleshoot a slow query?** Capture the actual plan and `STATISTICS
    IO/TIME`, look for scans, key lookups, sorts, and estimate-versus-actual gaps.
17. **What does SARGable mean?** A predicate an index seek can satisfy.
18. **Why avoid scalar UDFs?** They run per row, historically blocked parallelism, and hide
    their cost. SQL Server 2019 inlines many under compatibility level 150.
19. **Types of triggers?** AFTER/FOR, INSTEAD OF, DDL, and LOGON.
20. **Does a trigger fire per row?** No — once per statement.
21. **What is a columnstore index for?** Analytical scans over huge tables, with column
    elimination, high compression, and batch mode.
22. **Explain MDF, NDF, LDF.** Primary data file, optional secondary data files, and the
    transaction log.
23. **Log shipping vs replication?** DR for a whole database with manual failover, versus
    continuous distribution of selected tables to readable subscribers.
24. **Replication types?** Snapshot, Transactional, Merge, and Peer-to-Peer.
25. **How do you connect Java to SQL Server?** The Microsoft Type 4 JDBC driver with a
    `jdbc:sqlserver://host:1433;databaseName=DB;encrypt=true` URL, a pooled `Connection`,
    and `PreparedStatement` / `CallableStatement`.
