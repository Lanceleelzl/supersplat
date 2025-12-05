# 📜 Project Rules: The Law of Execution (项目流程与法度)

> **优先级说明**: 本文件定义了**具体项目的执行流程**。根据任务的复杂度，选择不同的执行通道。
> **注意**: 即使在“快速通道”中，代码质量仍需遵守 `ai_standards.md` 中的标准。

## 1. 双通道执行机制 (Two-Track Execution)

### 🚀 1.1 快速通道 (Fast Track / Script Mode)
**适用场景**:
- 编写一次性脚本 (Python/Shell/Node.js 等)。
- 实现单一的小功能函数或算法片段。
- 修复简单的 Bug。
- 用户明确指令：“直接写代码”、“写个 demo”、“不需要文档”。

**执行准则**:
1.  **免文档**: **完全跳过** `docs/` 下的所有文档创建/更新步骤。
2.  **直接编码**: 在理解需求后，直接生成/修改代码文件。
3.  **验证必选**: 即使是小脚本，也**必须**提供验证方法（如 `print`/`console.log`、简单的 `main` 函数或运行命令）。
4.  **质量兜底**: 代码风格、注释、变量命名仍需符合 `ai_standards.md` 的高标准。

### 🏗️ 1.2 标准通道 (Standard Track / Project Mode)
**适用场景**:
- 开发完整的业务模块 (任何语言/技术栈)。
- 前后端联调或跨语言协作 (如 C++ 算法 + Python 服务 + Web 前端)。
- 系统级重构。
- 涉及多个文件交互的复杂功能。
- 任何可能影响现有稳定性的变更。

**执行准则 (优化版 6A 流程)**:
1.  **Design & Plan**: 阅读 `docs/说明文档.md` -> 创建 `docs/任务名/PLAN.md`。
2.  **Execution**: 按 PLAN 文档逐步执行 -> 实时更新文档状态。
3.  **Assessment**: 验证功能 -> 归档任务 -> 更新总索引。

## 2. 文档治理策略 (仅限标准通道)

- **总索引 (`docs/说明文档.md`)**:
  - 作用：项目进度总览。
  - 维护：每次“标准任务”开始前阅读，结束后更新。
- **任务文档 (`docs/任务名/*.md`)**:
  - 作用：复杂任务的过程记录。
  - 维护：任务进行中实时更新，作为 AI 的短期记忆。

## 3. 通用技术栈规范 (Polyglot Tech Standards)

> **原则**: 本规则适用于 **任何编程语言** (TypeScript, Python, C++, Rust, Go 等)。

### 3.1 环境与上下文 (Environment & Context)
- **OS**: Windows + Trae。
- **上下文感知**: 启动任务前，必须分析当前目录结构，**自动识别**主要语言和框架（如检测到 `package.json` 则按 Node/Web 规范，检测到 `requirements.txt` 则按 Python 规范，检测到 `CMakeLists.txt` 则按 C++ 规范）。
- **依赖管理**: 引入新库时，必须检查并在对应的配置文件（如 `package.json`, `requirements.txt`, `Cargo.toml`）中添加依赖。

### 3.2 跨语言代码规范 (Universal Code Style)
- **Logic Separation**: 严禁将核心业务逻辑与 UI/框架代码强耦合。
- **File Structure**: 遵循当前语言的 **最佳实践目录结构** (Best Practice Project Layout)。
- **Resource/Assets**: 所有静态资源放入 `public/`, `static/`, `assets/` 或对应语言的标准资源目录，禁止散落在源码根目录。

### 3.3 验证机制 (Verification)
- **允许试错**: 开发过程中可以报错。
- **零错误交付**: **最终交付**给主人的代码，必须是经过你验证（编译通过/运行无误）的。
- **验证手段 (根据语言自动适配)**:
  - **Web/JS/TS**: `npm test`, `jest`, 浏览器预览。
  - **Python**: `pytest`, `python main.py`。
  - **C++/Rust/Go**: 编译 (`make`, `cargo build`, `go build`) 并运行单元测试。
  - **脚本**: 必须提供运行命令和预期输出。

## 4. 总结

- **小任务** -> **Fast Track** (直接写，高质量，验证必选)。
- **大任务** -> **Standard Track** (写文档，走流程，稳扎稳打)。
- **任何语言** -> **Context-Aware** (自动适配该语言的最佳实践)。
- **永远** -> **遵守 User Rules** (卑微、甜美、完美主义)。
