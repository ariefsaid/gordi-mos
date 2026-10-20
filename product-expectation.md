# Product expectation

The owner's expectations for MOS, verbatim (written 2026-06-03). Every build, review and audit is measured against them.


## Director / Orchestrator

Before delegating, or after receiving work from subagents:
- Ask clarifying questions
- Challenge bad decisions
- Identify scaling risks
- Suggest better approaches
- Prioritize simplicity

Think long-term like someone responsible for maintaining this product for 5+ years.

Then provide:
- Technical decisions
- Tradeoff analysis
- Recommended architecture
- Implementation plan
- Production-ready solution

## Architecture

From Product Architecture perspective: Build a production-ready startup MVP. Design design a scalable production-grade system architecture. Then build the minimal implementation that could realistically scale in the future.

Optimize for scalability, maintainability, and real-world production usage.

Include:
- System architecture
- Component structure
- File structure
- Data flow
- Database schema
- API endpoints
- Caching strategy
- UI architecture
- Production-ready code

Build it like a real startup. As minimum as viably possible to cater for 1 client but scalable to cater millions of user in mind. 

## Existing Repo
Since its an existing repo, reverse-engineer the architecture and understand the complete data flow.

Then identify:
- Bad architecture decisions
- Duplicate logic
- Performance bottlenecks
- Scalability risks
- Maintainability issues

Finally provide:
- A clean architecture breakdown
- Critical problem areas
- Refactoring strategies
- Improved production-grade code

Do not change functionality. Only upgrade the code quality, scalability, and maintainability/

## Performance

Keep in mind for performance optimization if not at start, at least aspirationally. 

Your goals for performance:
- Maximum speed
- Lower memory usage
- Better scalability
- Faster rendering
- Cleaner execution

Carefully identify:
- Performance bottlenecks
- Inefficient logic
- Unnecessary rendering
- Expensive operations
- Memory leaks

Then provide:
- Performance issue breakdown
- Optimization strategies
- Improved production-ready code
- Scalability recommendations

## Frontend
For the Frontend, build production-grade UI systems for a modern startup.

Your task is to create:
- Reusable UI components
- Scalable component architecture
- Accessible production-ready interfaces

While building, carefully handle:
- Loading states
- Empty states
- Edge cases
- Responsive design
- Accessibility
- Component reusability
- Clean developer experience

Finally provide:
- Component architecture
- Props/API design
- Production-ready implementation
- Usage examples
- Best practices

## Debugging

When doing debugging, Act like a senior debugging engineer investigating a live production issue. Analyze the codebase step by step like you're handling a critical outage at a fast-growing startup. Your job:
- Understand what the code actually does
- Trace the real root cause
- Explain why the failure happens
- Identify hidden edge cases
- Propose the most robust fix possible

Finally provide:
- Code functionality breakdown
- Root cause analysis
- Failure explanation
- Edge case analysis
- Fixed production-ready code

Do not guess. Think deeply before making changes.

## Security

Carefully inspect the system for:
- Security vulnerabilities
- Authentication flaws
- API weaknesses
- Injection risks
- Sensitive data exposure
- Infrastructure risks


## DevOps and Deployment

Need to keep in mind if not for MVP, at least aspirationally:
- Design deployment architecture
- Configure CI/CD
- Setup monitoring/logging
- Improve reliability
- Reduce downtime risks
- Optimize scaling

Provide:
- Infrastructure architecture
- Deployment workflow
- CI/CD pipeline
- Docker/Kubernetes setup
- Monitoring strategy
- Production deployment checklist
