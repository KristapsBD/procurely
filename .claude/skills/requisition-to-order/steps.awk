# Turns a TLC -difftrace counterexample into one line per step:
# "<state>. <request> <action> -> <its next label>", after the scenario
# (owner, rules, editLines), and "status: <new>" when the status commits.
/^State [0-9]+: </ {
  flush()
  n = $2; sub(":", "", n)
  act = $3; sub("<", "", act)
  next
}
n == 1 && /^\/\\ (owner|rules|editLines) = / { sub(/^\/\\ /, ""); print "scenario: " $0 }
/^\/\\ status = / { st = $0; sub(/^\/\\ status = /, "", st); gsub("\"", "", st) }
{
  line = $0
  while (match(line, /[a-z][a-z0-9]* :> "[A-Za-z]+"/)) {
    m = substr(line, RSTART, RLENGTH)
    split(m, kv, " :> ")
    gsub("\"", "", kv[2])
    cur[kv[1]] = kv[2]
    line = substr(line, RSTART + RLENGTH)
  }
}
/^$/ || /states generated/ { flush() }
function flush(   p) {
  if (act == "") return
  if (act != "Initial")
    for (p in cur) if (cur[p] != prev[p]) print n ". " p " " act " -> " cur[p]
  if (st != "" && st != prevSt && act != "Initial") print n ". status: " st
  for (p in cur) prev[p] = cur[p]
  prevSt = st
  act = ""
}
