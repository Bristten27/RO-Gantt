"use client";

import { useState, useEffect, useRef } from "react";
import { toPng } from "html-to-image";

type CriticalTaskData = {
  es: number;
  ef: number;
  ls: number;
  lf: number;
  margin: number;
  freeMargin: number;
  isCritical: boolean;
};

export default function Home() {
  const [cols, setCols] = useState(4);
  const increaseCols = () => setCols((prev) => prev + 1);
  const decreaseCols = () => setCols((prev) => (prev > 1 ? prev - 1 : 1));

  const ganttRef = useRef<HTMLDivElement>(null);

  const exportGanttToPng = async () => {
    if (!ganttRef.current) return;
    try {
      const dataUrl = await toPng(ganttRef.current, { cacheBust: true, backgroundColor: "#ffffff" });
      const link = document.createElement("a");
      link.download = "diagramme-gantt.png";
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Erreur lors de l'export PNG :", err);
    }
  };

  const [tableData, setTableData] = useState<string[][]>([
    ["", "", "", ""],
    ["", "", "", ""],
    ["", "", "", ""],
  ]);

  useEffect(() => {
    setTableData((prev) =>
      prev.map((row) => {
        if (cols > row.length) return [...row, ...Array(cols - row.length).fill("")];
        return row.slice(0, cols);
      })
    );
  }, [cols]);

  const handleChange = (rowIndex: number, colIndex: number, value: string) => {
    setTableData((prev) => {
      const newData = prev.map((r) => [...r]);
      newData[rowIndex][colIndex] = value;
      return newData;
    });
  };

  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [criticalStep, setCriticalStep] = useState(0);
  const [showCritical, setShowCritical] = useState(false);
  const [successorStep, setSuccessorStep] = useState(0);
  const [showSuccessors, setShowSuccessors] = useState(false);
  const [successorPhase, setSuccessorPhase] = useState(0);
  const [showLateDates, setShowLateDates] = useState(false);
  const [lateDateStep, setLateDateStep] = useState(0);
  const [showTotalMargin, setShowTotalMargin] = useState(false);
  const [totalMarginStep, setTotalMarginStep] = useState(0);
  const [showBlueBars, setShowBlueBars] = useState(false);
  const [blueBarStep, setBlueBarStep] = useState(0);
  const [showFreeMarginTable, setShowFreeMarginTable] = useState(false);
  const [freeMarginTableStep, setFreeMarginTableStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const stepsList = [
    "Positionnement des taches",
    "Chemin critique",
    "Les taches successeurs",
    "Date au plus tard (Flexibilite globale)",
    "Marge totale",
    "Flexibilite immediate",
    "Marge libre",
  ];

  const taskNames = tableData[0].map((n) => n.trim()).filter((n) => n !== "");

  const tasks = taskNames.map((name, i) => {
    const duration = parseInt(tableData[1][i]) || 0;
    const depsRaw = tableData[2][i];
    const deps =
      depsRaw.trim() === "-" || depsRaw.trim() === ""
        ? []
        : depsRaw.split(",").map((d) => d.trim()).filter((d) => d !== "");
    return { name, duration, deps };
  });

  const validTasks = tasks.filter((t) => t.name !== "" && t.duration > 0);

  const invalidDeps: string[] = [];
  const taskNamesLower = new Set(taskNames.map((n) => n.toLowerCase()));
  tasks.forEach((t) => {
    if (!t.name) return;
    t.deps.forEach((dep) => {
      if (dep && dep !== "-" && !taskNamesLower.has(dep.toLowerCase())) {
        invalidDeps.push(`"${t.name}" depend de "${dep}" mais cette tache n existe pas.`);
      }
    });
  });

  const canStart = validTasks.length >= 2 && invalidDeps.length === 0;

  const maxTime = 50;
  const timeLabels = Array.from({ length: maxTime }, (_, i) => i + 1);

  const sortTasksByDependencies = (tasksToSort: typeof validTasks) => {
    const sorted: typeof validTasks = [];
    const displayed = new Set<string>();
    while (sorted.length < tasksToSort.length) {
      let progress = false;
      tasksToSort.forEach((task) => {
        if (displayed.has(task.name.toLowerCase())) return;
        const allDepsDisplayed = task.deps.every((dep) => {
          const depExists = tasksToSort.some((t) => t.name.toLowerCase() === dep.toLowerCase());
          return depExists && displayed.has(dep.toLowerCase());
        });
        if (allDepsDisplayed) {
          sorted.push(task);
          displayed.add(task.name.toLowerCase());
          progress = true;
        }
      });
      if (!progress) return { sorted, circular: true };
    }
    return { sorted, circular: false };
  };

  const { sorted: orderedTasks, circular: hasCircular } =
    validTasks.length > 0 ? sortTasksByDependencies(validTasks) : { sorted: [] as typeof validTasks, circular: false };

  useEffect(() => {
    if (hasCircular && started) {
      setErrorMsg("Dependances circulaires detectees ! Verifiez vos antecedents.");
    }
  }, [hasCircular, started]);

  const calculateCriticalPath = (tasksCP: typeof validTasks) => {
    const es: Record<string, number> = {};
    const ef: Record<string, number> = {};
    const ls: Record<string, number> = {};
    const lf: Record<string, number> = {};

    tasksCP.forEach((task) => {
      es[task.name] = task.deps.length === 0 ? 0 : Math.max(...task.deps.map((d) => ef[d] || 0));
      ef[task.name] = es[task.name] + task.duration;
    });

    const projectEnd = Math.max(...Object.values(ef));

    const successors: Record<string, string[]> = {};
    tasksCP.forEach((t) => { successors[t.name] = []; });
    tasksCP.forEach((t) => {
      t.deps.forEach((dep) => { if (successors[dep]) successors[dep].push(t.name); });
    });

    [...tasksCP].reverse().forEach((task) => {
      lf[task.name] = successors[task.name].length === 0
        ? projectEnd
        : Math.min(...successors[task.name].map((s) => ls[s]));
      ls[task.name] = lf[task.name] - task.duration;
    });

    const result: Record<string, CriticalTaskData> = {};
    tasksCP.forEach((task) => {
      const margin = ls[task.name] - es[task.name];
      const succs = successors[task.name];
      const freeMargin = succs.length === 0
        ? projectEnd - ef[task.name]
        : Math.min(...succs.map((s) => es[s])) - ef[task.name];
      result[task.name] = { es: es[task.name], ef: ef[task.name], ls: ls[task.name], lf: lf[task.name], margin, freeMargin, isCritical: margin === 0 };
    });
    return { result, projectEnd, successors };
  };

  const cpData = orderedTasks.length > 0 && !hasCircular ? calculateCriticalPath(orderedTasks) : null;
  const criticalData = cpData?.result ?? {};
  const projectEnd = cpData?.projectEnd ?? 0;
  const successorsData = cpData?.successors ?? {};

  const criticalPath = orderedTasks.filter((t) => criticalData[t.name]?.isCritical).map((t) => t.name);

  const isAllTasksDisplayed = orderedTasks.length > 0 && step >= orderedTasks.length - 1;
  const isCriticalComplete = showCritical && criticalStep === criticalPath.length;
  const successorEntries: [string, string[]][] = Object.entries(successorsData);
  const isSuccessorsComplete = showSuccessors && successorStep === successorEntries.length;
  const currentTaskName = successorEntries[successorStep]?.[0];
  const isLateDatesComplete = showLateDates && lateDateStep >= orderedTasks.length;
  const isTotalMarginComplete = showTotalMargin && totalMarginStep >= orderedTasks.length;
  const isBlueBarsComplete = showBlueBars && blueBarStep >= orderedTasks.length;
  const isFreeMarginTableComplete = showFreeMarginTable && freeMarginTableStep >= orderedTasks.length;

  const displayedTasks = orderedTasks.slice(0, step + 1).map((t) => t.name);

  const resetAll = () => {
    setStarted(false); setStep(0); setShowCritical(false); setCriticalStep(0);
    setShowSuccessors(false); setSuccessorStep(0); setSuccessorPhase(0);
    setShowLateDates(false); setLateDateStep(0); setShowTotalMargin(false); setTotalMarginStep(0);
    setShowBlueBars(false); setBlueBarStep(0); setShowFreeMarginTable(false); setFreeMarginTableStep(0);
    setErrorMsg(null);
  };

  const handleNext = () => {
    if (step < orderedTasks.length - 1) setStep((p) => p + 1);
    else if (!showCritical) setShowCritical(true);
    else if (criticalStep < criticalPath.length) setCriticalStep((p) => p + 1);
    else if (!showSuccessors) setShowSuccessors(true);
    else if (!isSuccessorsComplete) {
      if (successorPhase === 0) setSuccessorPhase(2);
      else { setSuccessorPhase(0); setSuccessorStep((p) => p + 1); }
    } else if (!showLateDates) { setShowLateDates(true); setLateDateStep(1); }
    else if (lateDateStep < orderedTasks.length) setLateDateStep((p) => p + 1);
    else if (!showTotalMargin && isLateDatesComplete) { setShowTotalMargin(true); setTotalMarginStep(1); }
    else if (totalMarginStep < orderedTasks.length) setTotalMarginStep((p) => p + 1);
    else if (!showBlueBars && isTotalMarginComplete) { setShowBlueBars(true); setBlueBarStep(1); }
    else if (blueBarStep < orderedTasks.length) setBlueBarStep((p) => p + 1);
    else if (!showFreeMarginTable && isBlueBarsComplete) { setShowFreeMarginTable(true); setFreeMarginTableStep(1); }
    else if (freeMarginTableStep < orderedTasks.length) setFreeMarginTableStep((p) => p + 1);
  };

  const handlePrevious = () => {
    if (showFreeMarginTable) {
      if (freeMarginTableStep > 1) setFreeMarginTableStep((p) => p - 1);
      else { setShowFreeMarginTable(false); setFreeMarginTableStep(0); }
    } else if (showBlueBars) {
      if (blueBarStep > 1) setBlueBarStep((p) => p - 1);
      else { setShowBlueBars(false); setBlueBarStep(0); }
    } else if (showTotalMargin) {
      if (totalMarginStep > 1) setTotalMarginStep((p) => p - 1);
      else { setShowTotalMargin(false); setTotalMarginStep(0); }
    } else if (showLateDates) {
      if (lateDateStep > 1) setLateDateStep((p) => p - 1);
      else { setShowLateDates(false); setLateDateStep(0); }
    } else if (showSuccessors) {
      if (!isSuccessorsComplete && successorPhase === 2) setSuccessorPhase(0);
      else if (successorStep > 0) { setSuccessorStep((p) => p - 1); setSuccessorPhase(2); }
      else { setShowSuccessors(false); setSuccessorStep(0); setSuccessorPhase(0); }
    } else if (showCritical) {
      if (criticalStep > 0) setCriticalStep((p) => p - 1);
      else setShowCritical(false);
    } else if (step > 0) setStep((p) => p - 1);
  };

  const sortedTasksForGantt = [...orderedTasks].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="min-h-screen p-4 sm:p-6 bg-slate-100">
      <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold text-indigo-950 flex items-center gap-3">
          <svg className="w-8 h-8 text-indigo-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012-2m-6 9l2 2 4-4"></path>
          </svg>
          Planificateur de taches
        </h1>
        <div className="text-xs text-gray-500 italic">v1.0.0 - Ordonnancement de taches</div>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-red-50 border border-red-300 text-red-700 rounded-lg text-sm">
          {errorMsg}
          <button onClick={() => setErrorMsg(null)} className="ml-3 text-red-500 hover:text-red-700 font-bold">X</button>
        </div>
      )}

      {/* Grille modifiee : 4 colonnes, le Gantt/tableau prend 3 colonnes, le panneau lateral 1 colonne */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 order-2 lg:order-1">
          <div className="bg-white rounded-lg shadow-md p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Tableau des taches</h2>
                <p className="text-xs text-gray-400 mt-0.5">Modifiable a tout moment</p>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <span>Colonnes :</span>
                <button onClick={decreaseCols} className="px-2 py-1 bg-gray-100 rounded hover:bg-gray-200 transition-colors">-</button>
                <span className="font-semibold">{cols}</span>
                <button onClick={increaseCols} className="px-2 py-1 bg-gray-100 rounded hover:bg-gray-200 transition-colors">+</button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse border border-gray-400">
                <thead>
                  <tr>
                    <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-xs uppercase text-gray-500 w-28">Taches</th>
                    {tableData[0].map((_, i) => (
                      <th key={i} className="border border-gray-400 px-1 py-1 text-center text-xs text-gray-400">#{i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-white">
                    <td className="border border-gray-400 px-3 py-2 font-medium text-gray-700 text-sm">Nom</td>
                    {tableData[0].map((value, i) => (
                      <td key={i} className="border border-gray-400 p-1">
                        <input type="text" value={value} onChange={(e) => handleChange(0, i, e.target.value)}
                          placeholder="Ex: A"
                          className="w-full text-center outline-none px-1 py-1.5 rounded focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all text-gray-900 font-medium" />
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white">
                    <td className="border border-gray-400 px-3 py-2 font-medium text-gray-700 text-sm">Duree</td>
                    {tableData[1].map((value, i) => (
                      <td key={i} className="border border-gray-400 p-1">
                        <input type="number" min={1} value={value} onChange={(e) => handleChange(1, i, e.target.value)}
                          placeholder="0"
                          className="w-full text-center outline-none px-1 py-1.5 rounded focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all text-gray-900 font-medium" />
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white">
                    <td className="border border-gray-400 px-3 py-2 font-medium text-gray-700 text-sm">Anteriorites</td>
                    {tableData[2].map((value, i) => (
                      <td key={i} className="border border-gray-400 p-1 text-center text-sm font-medium text-gray-900">
                        {showSuccessors && successorPhase === 0 && currentTaskName ? (
                          value.split(",").map((v) => v.trim()).map((part, idx) => (
                            <span key={idx}>
                              {idx > 0 && ", "}
                              <span className={part === currentTaskName ? "text-red-500 font-bold" : ""}>{part}</span>
                            </span>
                          ))
                        ) : (
                          <input type="text" value={value} onChange={(e) => handleChange(2, i, e.target.value)}
                            placeholder="- ou A, B"
                            className="w-full text-center outline-none px-1 py-1.5 rounded focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all text-gray-900 font-medium" />
                        )}
                      </td>
                    ))}
                  </tr>

                  {showSuccessors && (
                    <tr className="bg-white table-row-enter">
                      <td className="border border-gray-400 px-3 py-2 font-medium text-gray-700 text-sm">Successeurs</td>
                      {taskNames.map((tName, i) => {
                        const entry = successorEntries[i];
                        const vis = i < successorStep || (i === successorStep && successorPhase >= 1);
                        return (
                          <td key={i} className={`border border-gray-400 px-2 py-2 text-center text-sm font-medium text-gray-900 ${vis ? "cell-fade-in" : ""}`}>
                            {vis ? (entry ? (entry[1].length === 0 ? "Fin" : entry[1].join(", ")) : "") : ""}
                          </td>
                        );
                      })}
                    </tr>
                  )}

                  {showTotalMargin && (
                    <tr className="bg-white table-row-enter">
                      <td className="border border-gray-400 px-3 py-2 font-medium text-gray-700 text-sm">Marge totale</td>
                      {taskNames.map((tName, i) => (
                        <td key={i} className={`border border-gray-400 px-2 py-2 text-center text-sm font-semibold ${(criticalData[tName]?.margin ?? 0) === 0 ? "text-red-500" : "text-indigo-600"} ${i < totalMarginStep ? "cell-fade-in" : ""}`}>
                          {i < totalMarginStep ? criticalData[tName]?.margin ?? "" : ""}
                        </td>
                      ))}
                    </tr>
                  )}

                  {showFreeMarginTable && (
                    <tr className="bg-white table-row-enter">
                      <td className="border border-gray-400 px-3 py-2 font-medium text-gray-700 text-sm">Marge libre</td>
                      {taskNames.map((tName, i) => {
                        const fm = criticalData[tName]?.freeMargin ?? 0;
                        return (
                          <td key={i} className={`border border-gray-400 px-2 py-2 text-center text-sm font-semibold ${fm === 0 ? "text-red-500" : "text-indigo-600"} ${i < freeMarginTableStep ? "cell-fade-in" : ""}`}>
                            {i < freeMarginTableStep ? fm : ""}
                          </td>
                        );
                      })}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {invalidDeps.length > 0 && !started && (
              <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                {invalidDeps.map((msg, i) => <div key={i}>X {msg}</div>)}
              </div>
            )}
            {validTasks.length < 2 && !started && (
              <p className="mt-2 text-xs text-gray-400">Ajoutez au moins 2 taches avec un nom et une duree.</p>
            )}
          </div>

          {started && (
            <div ref={ganttRef} className="bg-white rounded-lg shadow-md p-4 overflow-x-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Diagramme Gantt</h3>
                <button
                  onClick={exportGanttToPng}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  Exporter en PNG
                </button>
              </div>

              <div style={{ minWidth: `${(maxTime + 2) * 22}px` }}>
                <table className="border-collapse text-xs" style={{ tableLayout: "fixed", width: `${(maxTime + 2) * 22}px` }}>
                  <thead>
                    <tr>
                      <th style={{ width: 32, minWidth: 32 }} className="text-center text-gray-600 border-0 pb-1 font-normal">0</th>
                      {timeLabels.map((t) => (
                        <th key={t} style={{ width: 22, minWidth: 22, fontWeight: "normal" }} className="text-center text-gray-500 border-0 pb-1 text-[10px]">{t}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTasksForGantt.length === 0 ? (
                      <tr><td colSpan={maxTime + 2} className="text-center text-gray-400 py-12 italic">Aucune tache valide a afficher.</td></tr>
                    ) : (
                      sortedTasksForGantt.map((task) => {
                        const isVisible = displayedTasks.includes(task.name);
                        const info = criticalData[task.name];
                        const ordIdx = orderedTasks.findIndex((t) => t.name === task.name);
                        const revIdx = orderedTasks.length - 1 - ordIdx;
                        const isOrangeVisible = showLateDates && revIdx < lateDateStep;
                        const isBlueVisible = showBlueBars && ordIdx < blueBarStep;

                        return (
                          <tr key={task.name}>
                            <td style={{ width: 32, minWidth: 32 }} className="text-center font-semibold text-gray-800 border border-gray-300 bg-white text-[11px]">{task.name}</td>
                            {timeLabels.map((t) => {
                              if (!isVisible || !info) return (
                                <td key={t} style={{ width: 22, minWidth: 22, height: 42, padding: 0, position: "relative", overflow: "hidden" }} className="border border-dashed bg-white" />
                              );

                              const isEarlyDate = t > info.es && t <= info.ef;
                              const critIdx = criticalPath.indexOf(task.name);
                              const isCritVisible = showCritical && critIdx !== -1 && critIdx >= criticalPath.length - criticalStep;
                              const isCriticalCell = isEarlyDate && isCritVisible;
                              const isOrangeDate = isOrangeVisible && t > info.ls && t <= info.lf;
                              const succs = successorsData[task.name] || [];
                              const minSuccES = succs.length === 0 ? projectEnd : Math.min(...succs.map((s) => criticalData[s]?.es ?? projectEnd));
                              const isBlueDate = isBlueVisible && t > minSuccES - task.duration && t <= minSuccES;

                              return (
                                <td key={t} style={{ width: 22, minWidth: 22, height: 42, padding: 0, position: "relative", overflow: "hidden" }} className="border border-dashed bg-white">
                                  {isBlueDate && <div className="bg-blue-400 gantt-bar-enter bar-grow" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "30%", zIndex: 3, borderBottom: "1px solid white" }} />}
                                  {isOrangeDate && <div className="bg-orange-400 gantt-bar-enter bar-grow" style={{ position: "absolute", top: "30%", left: 0, width: "100%", height: "26%", zIndex: 2 }} />}
                                  {(isEarlyDate || isCriticalCell) && (
                                    <div className={`${isCriticalCell ? "bg-red-500 critical-pulse" : "bg-green-400"} gantt-bar-enter bar-grow`}
                                      style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: "35%", zIndex: 1 }} />
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-4 mt-3 text-xs text-gray-600 flex-wrap">
                <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 bg-green-400 rounded" /> Date au plus tot</span>
                <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 bg-red-400 rounded" /> Chemin critique</span>
                <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 bg-orange-400 rounded" /> Flexibilite globale</span>
                <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 bg-blue-400 rounded" /> Flexibilite immediate</span>
              </div>
            </div>
          )}
        </div>

        <div className="order-1 lg:order-2">
          <div className="bg-white p-4 rounded-lg shadow-md sticky top-6">
            {!started ? (
              <div className="mb-6">
                <button onClick={() => { if (canStart) { resetAll(); setStarted(true); }}}
                  disabled={!canStart}
                  className={`w-full py-3 rounded-lg text-white font-bold text-base transition-all ${canStart ? "bg-indigo-600 hover:bg-indigo-700 shadow-md hover:shadow-lg" : "bg-gray-300 cursor-not-allowed"}`}>
                  {validTasks.length < 2 ? "Ajoutez au moins 2 taches" : invalidDeps.length > 0 ? "Corrigez les dependances" : "Demarrer l analyse"}
                </button>
              </div>
            ) : (
              <>
                <div className="flex gap-2 mb-6">
                  <button onClick={handlePrevious}
                    disabled={step === 0 && !showCritical && !showSuccessors && !showLateDates && !showTotalMargin && !showBlueBars && !showFreeMarginTable}
                    className={`flex-1 py-2.5 rounded-lg text-white font-medium text-sm transition-colors ${step === 0 && !showCritical && !showSuccessors && !showLateDates && !showTotalMargin && !showBlueBars && !showFreeMarginTable ? "bg-gray-300 cursor-not-allowed" : "bg-gray-500 hover:bg-gray-600"}`}>
                    Retour
                  </button>
                  <button onClick={handleNext} className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-colors">Suivant</button>
                </div>
                <button onClick={() => { resetAll(); }} className="w-full mb-5 py-2 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 text-sm transition-colors">Modifier les taches</button>
              </>
            )}

            <div>
              <h3 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Etapes</h3>
              {stepsList.map((label, index) => {
                const isStepDone = (index === 0 && isAllTasksDisplayed) || (index === 1 && isCriticalComplete) || (index === 2 && isSuccessorsComplete) || (index === 3 && isLateDatesComplete) || (index === 4 && isTotalMarginComplete) || (index === 5 && isBlueBarsComplete) || (index === 6 && isFreeMarginTableComplete);
                const isActive = started && ((index === 0 && !isStepDone && !isAllTasksDisplayed) || (index === 1 && isAllTasksDisplayed && !isCriticalComplete && !isStepDone) || (index === 2 && isCriticalComplete && !isSuccessorsComplete && !isStepDone) || (index === 3 && isSuccessorsComplete && !isLateDatesComplete && !isStepDone) || (index === 4 && isLateDatesComplete && !isTotalMarginComplete && !isStepDone) || (index === 5 && isTotalMarginComplete && !isBlueBarsComplete && !isStepDone) || (index === 6 && isBlueBarsComplete && !isFreeMarginTableComplete && !isStepDone));
                return (
                  <div key={index} className={`flex items-center gap-2.5 p-2 rounded-lg mb-1 transition-all ${isActive ? "bg-indigo-50 border border-indigo-200" : isStepDone ? "bg-green-50 border border-green-200" : started ? "bg-gray-50 border border-gray-200 opacity-60" : "bg-gray-50 border border-gray-200 opacity-50"}`}>
                    <div className={`w-5 h-5 flex items-center justify-center rounded-full text-white text-[10px] font-bold shrink-0 ${isStepDone ? "bg-green-500" : isActive ? "bg-indigo-600" : "bg-gray-300"}`}>{isStepDone ? "V" : index + 1}</div>
                    <p className={`text-xs ${isStepDone ? "text-green-700 line-through" : isActive ? "text-indigo-900 font-medium" : "text-gray-500"}`}>{label}</p>
                  </div>
                );
              })}
            </div>

            {started && (
              <div className="mt-5 pt-4 border-t border-gray-200">
                <div className="text-xs text-gray-500 mb-1">
                  Progression : {Math.round(
                    [isAllTasksDisplayed, isCriticalComplete, isSuccessorsComplete,
                     isLateDatesComplete, isTotalMarginComplete, isBlueBarsComplete,
                     isFreeMarginTableComplete].filter(Boolean).length / 7 * 100
                  )}%
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-indigo-700 rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.round(
                        [isAllTasksDisplayed, isCriticalComplete, isSuccessorsComplete,
                         isLateDatesComplete, isTotalMarginComplete, isBlueBarsComplete,
                         isFreeMarginTableComplete].filter(Boolean).length / 7 * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}