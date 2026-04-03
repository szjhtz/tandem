pub const COMMAND_HELP: &[(&str, &str)] = &[
    ("help", "Show available commands"),
    ("diff", "Show workspace git diff overlay"),
    ("files", "Search workspace files and insert @path"),
    ("edit", "Open external editor for current draft"),
    ("workspace", "Show/switch workspace directory"),
    ("engine", "Engine status / restart"),
    ("recent", "List, replay, or clear recent slash commands"),
    ("sessions", "List all sessions"),
    ("new", "Create new session"),
    ("agent", "Manage in-chat agents"),
    ("use", "Switch to session by ID"),
    ("title", "Rename current session"),
    ("prompt", "Send prompt to session"),
    ("cancel", "Cancel current operation"),
    ("last_error", "Show last prompt/system error"),
    ("messages", "Show message history"),
    ("modes", "List available modes"),
    ("mode", "Set or show current mode"),
    ("providers", "List available providers"),
    ("provider", "Set current provider"),
    ("models", "List models for provider"),
    ("model", "Set current model"),
    ("keys", "Show configured API keys"),
    ("key", "Manage provider API keys"),
    ("approve", "Approve a pending request"),
    ("deny", "Deny a pending request"),
    ("answer", "Answer a question"),
    ("requests", "Open pending request center"),
    ("copy", "Copy latest assistant text to clipboard"),
    ("routines", "List scheduled routines"),
    ("routine_create", "Create interval routine"),
    ("routine_edit", "Edit routine interval"),
    ("routine_pause", "Pause a routine"),
    ("routine_resume", "Resume a routine"),
    ("routine_run_now", "Trigger a routine now"),
    ("routine_delete", "Delete a routine"),
    ("routine_history", "Show routine execution history"),
    ("context_runs", "List engine context runs"),
    ("context_run_create", "Create an engine context run"),
    ("context_run_get", "Get engine context run state"),
    (
        "context_run_rollback_preview",
        "Show rollback preview steps for a context run",
    ),
    (
        "context_run_rollback_execute",
        "Execute selected rollback steps for a context run",
    ),
    (
        "context_run_rollback_execute_all",
        "Execute every executable rollback preview step for a context run",
    ),
    (
        "context_run_rollback_history",
        "Show detailed rollback receipts for a context run",
    ),
    ("context_run_events", "Show context run events"),
    ("context_run_pause", "Pause context run"),
    ("context_run_resume", "Resume context run"),
    ("context_run_cancel", "Cancel context run"),
    (
        "context_run_blackboard",
        "Show context run blackboard summary",
    ),
    (
        "context_run_next",
        "Ask engine ContextDriver to choose next step",
    ),
    (
        "context_run_replay",
        "Replay context run from events/checkpoints",
    ),
    (
        "context_run_lineage",
        "Show decision lineage from context run events",
    ),
    (
        "context_run_bind",
        "Bind active agent todowrite updates to a context run",
    ),
    (
        "context_run_sync_tasks",
        "Sync current TUI task list into context run steps",
    ),
    ("missions", "List engine missions"),
    ("mission_create", "Create an engine mission"),
    ("mission_get", "Get mission details"),
    ("mission_event", "Apply mission event JSON"),
    ("mission_start", "Apply mission_started"),
    ("mission_review_ok", "Approve review gate"),
    ("mission_test_ok", "Approve test gate"),
    ("mission_review_no", "Deny review gate"),
    ("config", "Show configuration"),
];

pub const HELP_TEXT: &str = r#"Tandem TUI Commands:

QUICK START:
  Coding loop:
    /prompt <task...>
    /diff
    /files [query]
    /agent new
  Rollback loop:
    /context_run_get <run_id>
    /context_run_rollback_preview <run_id>
    /context_run_rollback_execute <run_id> --ack <event_id...>
    /context_run_rollback_history <run_id>
  Approval loop:
    /requests
    /approve <id> [always]
    /deny <id>
    /answer <id> <reply>

BASICS:
  /help              Show this help message
  /workspace show    Show current workspace directory
  /workspace use <path>
                     Switch workspace directory for this TUI process
  /engine status     Check engine connection status
  /engine restart    Restart the Tandem engine
  /engine token      Show masked engine API token
  /engine token show Show full engine API token
  /recent            Show recent slash commands
  /recent run <n>    Replay a recent slash command
  /recent clear      Clear recent slash-command history
  /browser status    Show browser readiness from the engine
  /browser doctor    Show browser diagnostics and install hints
  /diff              Show current workspace git diff in pager overlay
  /files [query]     Open file-search overlay and insert selected path as @mention
  /edit              Edit current draft in external $EDITOR/$VISUAL

SESSIONS:
  /sessions          List all sessions
  /new [title...]    Create new session
  /use <session_id> Switch to session
  /agent new         Create agent in current chat
  /agent list        List chat agents
  /agent use <A#>    Switch active agent
  /agent close       Close active agent
  /agent fanout [n] [goal...]
                     Ensure n agents and switch to grid (default 4).
                     If goal is provided, dispatch coordinated kickoff prompts.
  /title <new title> Rename current session
  /prompt <text>    Send prompt to current session
  /tool <name> <json_args> Pass-through engine tool call
  /cancel           Cancel current operation
  /steer <message>  Queue steering interrupt message
  /followup <msg>   Queue follow-up message
  /queue            Show queue status
  /queue clear      Clear steering/follow-up queue
  /last_error       Show last prompt/system error
  /messages [limit] Show session messages
  /task add <desc>   Add a new task
  /task done <id>    Mark task as done
  /task fail <id>    Mark task as failed
  /task work <id>    Mark task as working
  /task pin <id>     Toggle pin status
  /task list         List all tasks

MODES:
  /modes             List available modes
  /mode <name>       Set mode (ask|coder|explore|immediate|orchestrate|plan)
  /mode              Show current mode

PROVIDERS & MODELS:
  /providers         List available providers
  /provider <id>     Set current provider
  /models [provider] List models for provider
  /model <model_id>  Set current model

KEYS:
  /keys              Show configured providers
  /key set <provider> Add/update provider key
  /key remove <provider> Remove provider key
  /key test <provider> Test provider connection

APPROVALS:
  /approve <id> [always]  Approve request
  /approve all            Approve all pending in this session
  /deny <id>              Deny request
  /answer <id> <reply>    Send raw permission reply (allow/deny/once/always/reject)
  /requests               Open pending request center
  /copy                   Copy latest assistant response to clipboard

ROUTINES:
  /routines                               List routines
  /routine_create <id> <sec> <entrypoint> Create an interval routine
  /routine_edit <id> <sec>                Update interval schedule
  /routine_pause <id>                     Pause routine
  /routine_resume <id>                    Resume routine
  /routine_run_now <id> [count]           Trigger routine immediately
  /routine_delete <id>                    Delete routine
  /routine_history <id> [limit]           Show routine history

CONTEXT RUNS:
  /context_runs [limit]                   List context runs from engine
  /context_run_create <objective...>      Create context run (interactive type)
  /context_run_get <run_id>               Show context run details
  /context_run_rollback_preview <run_id>  Show rollback preview steps
  /context_run_rollback_execute <run_id> --ack <event_id...>
                                          Execute selected rollback steps
  /context_run_rollback_execute_all <run_id> --ack
                                          Execute all executable preview steps
  /context_run_rollback_history <run_id>  Show rollback receipt history
  /context_run_events <run_id> [tail]     Show recent context run events
  /context_run_pause <run_id>             Append pause event + set paused status
  /context_run_resume <run_id>            Append resume event + set running status
  /context_run_cancel <run_id>            Append cancel event + set cancelled status
  /context_run_blackboard <run_id>        Show blackboard counts + summary snippets
  /context_run_next <run_id> [dry_run]    Run engine ContextDriver next-step selection
  /context_run_replay <run_id> [upto_seq] Replay run and show drift vs persisted state
  /context_run_lineage <run_id> [tail]    Show why-next-step decision history
  /context_run_bind <run_id|off>          Bind or clear active-agent todo -> context sync
  /context_run_sync_tasks <run_id>         Sync current task list into context run steps

MISSIONS:
  /missions                                List missions
  /mission_create <title> :: <goal>        Create mission (supports optional work item title after third :: segment)
  /mission_get <mission_id>                Show mission details
  /mission_event <mission_id> <event_json> Apply mission event payload JSON
  /mission_start <mission_id>              Quick mission_started event
  /mission_review_ok <mission_id> <work_item_id> [approval_id]
                                           Quick approval_granted for review
  /mission_test_ok <mission_id> <work_item_id> [approval_id]
                                           Quick approval_granted for test
  /mission_review_no <mission_id> <work_item_id> [reason]
                                           Quick approval_denied for review
  /agent-team                              Show agent-team dashboard summary
  /agent-team missions                     List agent-team mission rollups
  /agent-team instances [mission_id]       List agent-team instances
  /agent-team approvals                    List pending agent-team approvals
  /agent-team bindings [team_name]         Show local teammate -> session bindings
  /agent-team approve spawn <approval_id> [reason]
                                           Approve pending spawn approval
  /agent-team deny spawn <approval_id> [reason]
                                           Deny pending spawn approval
  /agent-team approve tool <request_id>    Approve tool permission request
  /agent-team deny tool <request_id>       Deny tool permission request

PRESETS:
  /preset index
                                           List layered preset counts
  /preset agent compose <base_prompt> :: <fragments_json>
                                           Deterministic prompt compose preview
  /preset agent summary required=<csv> [:: optional=<csv>]
                                           Compute agent capability summary
  /preset agent fork <source_path> [target_id]
                                           Fork source preset into project override
  /preset automation summary <tasks_json> [:: required=<csv> :: optional=<csv>]
                                           Compute automation capability summary
  /preset automation save <id> :: <tasks_json> [:: required=<csv> :: optional=<csv>]
                                           Save automation preset override from task-agent bindings

CONFIG:
  /config            Show configuration

MULTI-AGENT KEYS:
  Tab / Shift+Tab    Cycle active agent
  Alt+1..Alt+9       Jump to agent slot
  Ctrl+N             New agent
  Ctrl+W             Close active agent
  Ctrl+C             Cancel active run / double-tap quit
  Alt+M              Cycle mode
  Alt+G              Toggle Focus/Grid
  Alt+R              Open request center
  Alt+P              Open file search overlay
  Alt+D              Open diff overlay
  Alt+E              Open external editor for current draft
  Alt+I              Queue steering interrupt (and cancel active run)
  [ / ]              Prev/next grid page
  Alt+S / Alt+B      Demo stream controls (dev)
  Enter              Send prompt (queues follow-up if busy)
  Shift+Enter        Insert newline
  Alt+Enter          Insert newline
  Esc                Close modal / return to input
  Ctrl+X             Quit"#;
