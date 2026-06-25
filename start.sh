#!/usr/bin/env bash

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── colors ────────────────────────────────────────────────────────────────────
RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'
CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
WHITE='\033[97m'
BG_DARK='\033[48;5;235m'

# ── helpers ───────────────────────────────────────────────────────────────────
info()    { printf "  ${CYAN}▸${RESET}  %s\n" "$*"; }
ok()      { printf "  ${GREEN}✔${RESET}  %s\n" "$*"; }
warn()    { printf "  ${YELLOW}⚠${RESET}  %s\n" "$*"; }
err()     { printf "  ${RED}✖${RESET}  %s\n" "$*" >&2; }
step()    { printf "\n  ${BOLD}${WHITE}%s${RESET}\n" "$*"; }
divider() { printf "  ${DIM}%s${RESET}\n" "────────────────────────────────────────"; }

# ── header ────────────────────────────────────────────────────────────────────
clear
printf "\n"
printf "  ${BOLD}${CYAN}╔══════════════════════════════════════╗${RESET}\n"
printf "  ${BOLD}${CYAN}║${RESET}  ${BOLD}${WHITE}ConvertToMD${RESET}  ${DIM}— dev environment${RESET}     ${BOLD}${CYAN}║${RESET}\n"
printf "  ${BOLD}${CYAN}╚══════════════════════════════════════╝${RESET}\n"
printf "\n"

# ── shutdown handler ──────────────────────────────────────────────────────────
ALL_PIDS=()

cleanup() {
  printf "\n\n"
  divider
  info "Shutting down…"
  for pid in "${ALL_PIDS[@]}"; do
    kill "$pid" 2>/dev/null && ok "Stopped PID $pid"
  done
  # Kill any child processes spawned by this session
  kill -- -$$ 2>/dev/null
  divider
  printf "  ${GREEN}${BOLD}All services stopped.${RESET}\n\n"
  exit 0
}

trap cleanup INT TERM

# ── ollama ────────────────────────────────────────────────────────────────────
step "Ollama"
divider
info "Starting Ollama server…"
ollama serve &>/dev/null &
OLLAMA_PID=$!
ALL_PIDS+=("$OLLAMA_PID")
sleep 1
if kill -0 "$OLLAMA_PID" 2>/dev/null; then
  ok "Ollama running  ${DIM}(PID $OLLAMA_PID)${RESET}"
else
  warn "Ollama may already be running — continuing"
fi

# ── backend ───────────────────────────────────────────────────────────────────
step "Backend"
divider
cd "$ROOT/backend"

# Controlla se il venv non esiste
if [ ! -f "venv/bin/activate" ]; then
  info "Virtualenv non trovato. Creazione in corso con Python 3.13..."
  
  # Verifica se python3.13 è installato nel sistema
  if command -v python3.13 &>/dev/null; then
    python3.13 -m venv venv && ok "Virtualenv creato con successo"
  else
    err "Python 3.13 non è installato nel sistema. Impossibile creare il venv."; cleanup
  fi
fi

# Attiva il venv (ora esistente)
source venv/bin/activate && ok "Activated virtualenv"

info "Installing dependencies…"
pip install -r requirements.txt -q && ok "Dependencies ready"
info "Starting FastAPI server…"
uvicorn main:app --reload --port 8000 &>/dev/null &
BACKEND_PID=$!
ALL_PIDS+=("$BACKEND_PID")
sleep 1
if kill -0 "$BACKEND_PID" 2>/dev/null; then
  ok "Backend running   ${DIM}http://localhost:8000  (PID $BACKEND_PID)${RESET}"
else
  err "Backend failed to start"; cleanup
fi

# ── frontend ──────────────────────────────────────────────────────────────────
step "Frontend"
divider
cd "$ROOT/frontend"
info "Installing dependencies…"
npm install --silent && ok "Dependencies ready"
info "Starting Vite dev server…"
npm run dev &>/dev/null &
FRONTEND_PID=$!
ALL_PIDS+=("$FRONTEND_PID")
sleep 2
if kill -0 "$FRONTEND_PID" 2>/dev/null; then
  ok "Frontend running  ${DIM}http://localhost:5173  (PID $FRONTEND_PID)${RESET}"
else
  err "Frontend failed to start"; cleanup
fi

# ── ready ─────────────────────────────────────────────────────────────────────
printf "\n"
printf "  ${BOLD}${CYAN}╔══════════════════════════════════════╗${RESET}\n"
printf "  ${BOLD}${CYAN}║${RESET}  ${GREEN}${BOLD}✔  All services are running${RESET}          ${BOLD}${CYAN}║${RESET}\n"
printf "  ${BOLD}${CYAN}║${RESET}                                        ${BOLD}${CYAN}║${RESET}\n"
printf "  ${BOLD}${CYAN}║${RESET}  ${WHITE}App  →  ${CYAN}http://localhost:5173${RESET}        ${BOLD}${CYAN}║${RESET}\n"
printf "  ${BOLD}${CYAN}║${RESET}  ${WHITE}API  →  ${CYAN}http://localhost:8000${RESET}        ${BOLD}${CYAN}║${RESET}\n"
printf "  ${BOLD}${CYAN}║${RESET}                                        ${BOLD}${CYAN}║${RESET}\n"
printf "  ${BOLD}${CYAN}║${RESET}  ${DIM}Press Ctrl+C to stop all services${RESET}   ${BOLD}${CYAN}║${RESET}\n"
printf "  ${BOLD}${CYAN}╚══════════════════════════════════════╝${RESET}\n"
printf "\n"

wait
