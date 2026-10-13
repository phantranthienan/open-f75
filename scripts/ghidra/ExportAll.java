// Static export for grepping: strings with referencing functions, imports with
// call sites, and the decompiled C of every function with its callers.
// Usage: -postScript ExportAll.java <out dir>
// @category Export
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileOptions;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Data;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.Symbol;
import ghidra.program.util.DefinedStringIterator;

import java.io.File;
import java.io.PrintWriter;
import java.util.Set;
import java.util.TreeSet;

public class ExportAll extends GhidraScript {
  private String where(Address a) {
    Function f = getFunctionContaining(a);
    return a + (f != null ? "@" + f.getName() : "");
  }

  @Override
  public void run() throws Exception {
    File out = new File(getScriptArgs()[0]);
    out.mkdirs();

    try (PrintWriter w = new PrintWriter(new File(out, "strings.txt"), "UTF-8")) {
      for (Data d : DefinedStringIterator.forProgram(currentProgram)) {
        StringBuilder refs = new StringBuilder();
        for (Reference r : getReferencesTo(d.getAddress())) refs.append(' ').append(where(r.getFromAddress()));
        String v = String.valueOf(d.getValue()).replace("\r", "\\r").replace("\n", "\\n");
        w.println(d.getAddress() + "\t" + d.getDataType().getName() + "\t" + v + "\t|" + refs);
      }
    }

    try (PrintWriter w = new PrintWriter(new File(out, "imports.txt"), "UTF-8")) {
      for (Symbol s : currentProgram.getSymbolTable().getExternalSymbols()) {
        Set<String> sites = new TreeSet<>();
        for (Reference r : s.getReferences()) {
          Address from = r.getFromAddress();
          sites.add(where(from));
          // IAT slot: the code references the slot, not the external symbol.
          for (Reference r2 : getReferencesTo(from)) sites.add(where(r2.getFromAddress()));
        }
        w.println(s.getParentNamespace().getName() + "!" + s.getName() + "\t" + String.join(" ", sites));
      }
    }

    DecompInterface di = new DecompInterface();
    di.setOptions(new DecompileOptions());
    di.toggleCCode(true);
    di.setSimplificationStyle("decompile");
    di.openProgram(currentProgram);
    int n = 0;
    try (PrintWriter w = new PrintWriter(new File(out, "decomp.c"), "UTF-8")) {
      for (Function f : currentProgram.getFunctionManager().getFunctions(true)) {
        if (monitor.isCancelled()) break;
        if (f.isThunk() || f.isExternal()) continue;
        Set<String> callers = new TreeSet<>();
        for (Function c : f.getCallingFunctions(monitor)) callers.add(c.getName());
        w.println("// ==== " + f.getEntryPoint() + " " + f.getName() + " callers: " + String.join(" ", callers));
        DecompileResults r = di.decompileFunction(f, 120, monitor);
        if (r != null && r.decompileCompleted()) w.println(r.getDecompiledFunction().getC());
        else w.println("// decompile failed: " + (r == null ? "null" : r.getErrorMessage()));
        if (++n % 500 == 0) println("decompiled " + n);
      }
    }
    di.dispose();
    println("done: " + n + " functions");
  }
}
