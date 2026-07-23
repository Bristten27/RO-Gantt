"use client";

import { useState, useRef } from "react";
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
  const [ganttZoom, setGanttZoom] = useState(1);
  const [isCircularErrorDismissed, setIsCircularErrorDismissed] = useState(false);

  const syncTableData = (nextCols: number) => {
    setTableData((prev) =>
      prev.map((row) => {
        if (nextCols > row.length) return [...row, ...Array(nextCols - row.length).fill("")];
        return row.slice(0, nextCols);
      })
    );
  };

  const increaseCols = () => {
    setCols((prev) => {
      const nextCols = prev + 1;
      syncTableData(nextCols);
      return nextCols;
    });
  };

  const decreaseCols = () => {
    setCols((prev) => {
      const nextCols = prev > 1 ? prev - 1 : 1;
      syncTableData(nextCols);
      return nextCols;
    });
  };

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

  const handleChange = (rowIndex: number, colIndex: number, value: string) => {
    setTableData((prev) => {
      const newData = prev.map((r) => [...r]);
      newData[rowIndex][colIndex] = value;
      return newData;
    });
  };

  const [phase, setPhase] = useState(0);

  const started = phase > 0;
  const showCritical = phase >= 2;
  const showSuccessors = phase >= 3;
  const showLateDates = phase >= 4;
  const showTotalMargin = phase >= 5;
  const showBlueBars = phase >= 6;
  const showFreeMarginTable = phase >= 7;

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

  const fallbackTimeline = 50;

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

  const errorMsg = !isCircularErrorDismissed && hasCircular && started
    ? "Dependances circulaires detectees ! Verifiez vos antecedents."
    : null;

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
  const ganttMaxTime = Math.max(fallbackTimeline, projectEnd);
  const timeLabels = Array.from({ length: ganttMaxTime }, (_, i) => i + 1);
  const successorsData = cpData?.successors ?? {};

  const progressPercent = Math.round((phase / 7) * 100);
  const isFinished = progressPercent === 100;

  const resetAll = () => {
    setPhase(0);
    setIsCircularErrorDismissed(false);
  };

  const handleNext = () => {
    if (phase < 7) {
      setPhase((p) => p + 1);
    }
  };

  const handlePrevious = () => {
    if (phase > 0) {
      setPhase((p) => p - 1);
    }
  };

  const sortedTasksForGantt = [...orderedTasks].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="min-h-screen p-4 sm:p-6 bg-[radial-gradient(circle_at_top_left,_#e0e7ff_0%,_#f8fafc_42%,_#e2e8f0_100%)]">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-indigo-100 bg-white/80 p-4 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold text-indigo-950 flex items-center gap-3">
            <svg className="w-8 h-8 text-indigo-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012-2m-6 9l2 2 4-4"></path>
            </svg>
            Planificateur de taches
          </h1>
          <div className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 italic shadow-sm">v1.0.0 - Ordonnancement de taches</div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 border border-red-300 text-red-700 rounded-lg text-sm">
            {errorMsg}
            <button onClick={() => setIsCircularErrorDismissed(true)} className="ml-3 text-red-500 hover:text-red-700 font-bold">X</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 order-2 lg:order-1">
            <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 mb-6 shadow-sm">
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
                          <input type="text" value={value} onChange={(e) => handleChange(2, i, e.target.value)}
                            placeholder="- ou A, B"
                            className="w-full text-center outline-none px-1 py-1.5 rounded focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all text-gray-900 font-medium" />
                        </td>
                      ))}
                    </tr>

                    {showSuccessors && (
                      <tr className="bg-white table-row-enter">
                        <td className="border border-gray-400 px-3 py-2 font-medium text-gray-700 text-sm">Successeurs</td>
                        {taskNames.map((tName, i) => {
                          const successors = successorsData[tName] ?? [];
                          return (
                            <td key={i} className="border border-gray-400 px-2 py-2 text-center text-sm font-medium text-gray-900 cell-fade-in">
                              {successors.length === 0 ? "Fin" : successors.join(", ")}
                            </td>
                          );
                        })}
                      </tr>
                    )}

                    {showTotalMargin && (
                      <tr className="bg-white table-row-enter">
                        <td className="border border-gray-400 px-3 py-2 font-medium text-gray-700 text-sm">Marge totale</td>
                        {taskNames.map((tName, i) => (
                          <td key={i} className={`border border-gray-400 px-2 py-2 text-center text-sm font-semibold ${(criticalData[tName]?.margin ?? 0) === 0 ? "text-red-500" : "text-indigo-600"} cell-fade-in`}>
                            {criticalData[tName]?.margin ?? ""}
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
                            <td key={i} className={`border border-gray-400 px-2 py-2 text-center text-sm font-semibold ${fm === 0 ? "text-red-500" : "text-indigo-600"} cell-fade-in`}>
                              {fm}
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
              <div ref={ganttRef} className="bg-white rounded-lg shadow-md p-4 overflow-x-auto" style={{ zoom: ganttZoom }}>
                <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                  <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Diagramme Gantt</h3>
                  <div className="flex items-center gap-2 text-[11px] text-gray-600">
                    <span>Vue :</span>
                    <input
                      type="range"
                      min="0.5"
                      max="1"
                      step="0.1"
                      value={ganttZoom}
                      onChange={(e) => setGanttZoom(Number(e.target.value))}
                      className="accent-indigo-600"
                    />
                    <span className="font-medium text-indigo-700">{ganttZoom.toFixed(1)}x</span>
                  </div>
                  <button
                    onClick={exportGanttToPng}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    Exporter en PNG
                  </button>
                </div>

                <div style={{ minWidth: `${(ganttMaxTime + 2) * 22}px` }}>
                  <table className="border-collapse text-xs" style={{ tableLayout: "fixed", width: `${(ganttMaxTime + 2) * 22}px` }}>
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
                        <tr><td colSpan={ganttMaxTime + 2} className="text-center text-gray-400 py-12 italic">Aucune tache valide a afficher.</td></tr>
                      ) : (
                        sortedTasksForGantt.map((task) => {
                          const isVisible = started;
                          const info = criticalData[task.name];

                          return (
                            <tr key={task.name}>
                              <td style={{ width: 32, minWidth: 32 }} className="text-center font-semibold text-gray-800 border border-gray-300 bg-white text-[11px]">{task.name}</td>
                              {timeLabels.map((t) => {
                                if (!isVisible || !info) return (
                                  <td key={t} style={{ width: 22, minWidth: 22, height: 42, padding: 0, position: "relative", overflow: "hidden" }} className="border border-dashed bg-white" />
                                );

                                const isEarlyDate = t > info.es && t <= info.ef;
                                const isCritVisible = showCritical && info.isCritical;
                                const isCriticalCell = isEarlyDate && isCritVisible;
                                const isOrangeDate = showLateDates && t > info.ls && t <= info.lf;
                                const succs = successorsData[task.name] || [];
                                const minSuccES = succs.length === 0 ? projectEnd : Math.min(...succs.map((s) => criticalData[s]?.es ?? projectEnd));
                                const isBlueDate = showBlueBars && t > minSuccES - task.duration && t <= minSuccES;

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
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm sticky top-6 backdrop-blur">
              {!started ? (
                <div className="mb-6">
                  <button onClick={() => { if (canStart) { resetAll(); setPhase(1); }}}
                    disabled={!canStart}
                    className={`w-full py-3 rounded-xl text-white font-bold text-base transition-all ${canStart ? "bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 shadow-md hover:shadow-lg" : "bg-gray-300 cursor-not-allowed"}`}>
                    {validTasks.length < 2 ? "Ajoutez au moins 2 taches" : invalidDeps.length > 0 ? "Corrigez les dependances" : "Demarrer l analyse"}
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2 mb-6">
                    <button onClick={handlePrevious}
                      disabled={phase === 0}
                      className={`flex-1 py-2.5 rounded-xl text-white font-medium text-sm transition-colors ${phase === 0 ? "bg-gray-300 cursor-not-allowed" : "bg-slate-500 hover:bg-slate-600"}`}>
                      Retour
                    </button>
                    <button onClick={handleNext}
                      disabled={phase >= 7}
                      className={`flex-1 py-2.5 rounded-xl text-white font-medium text-sm transition-colors ${phase >= 7 ? "bg-indigo-300 cursor-not-allowed" : "bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800"}`}>
                      Suivant
                    </button>
                  </div>
                  <button onClick={() => { resetAll(); }} className="w-full mb-5 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 text-sm transition-colors">Modifier les taches</button>
                </>
              )}

              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Etapes</h3>
                {stepsList.map((label, index) => {
                  const stepNum = index + 1;
                  const isStepDone = phase >= stepNum;
                  const isActive = started && phase === stepNum - 1;
                  return (
                    <div key={index} className={`flex items-center gap-2.5 p-2 rounded-xl mb-1 transition-all ${isActive ? "bg-indigo-50 border border-indigo-200 shadow-sm" : isStepDone ? "bg-green-50 border border-green-200 shadow-sm" : "bg-gray-50 border border-gray-200 opacity-70"}`}>
                      <div className={`w-5 h-5 flex items-center justify-center rounded-full text-white text-[10px] font-bold shrink-0 ${isStepDone ? "bg-green-500" : isActive ? "bg-indigo-600" : "bg-gray-300"}`}>{isStepDone ? "V" : stepNum}</div>
                      <p className={`text-xs ${isStepDone ? "text-green-700 font-medium" : isActive ? "text-indigo-900 font-medium" : "text-gray-500"}`}>{label}</p>
                    </div>
                  );
                })}
              </div>

              {started && (
                <div className="mt-5 pt-4 border-t border-gray-200">
                  <div className="flex justify-between items-center text-xs text-gray-500 mb-1">
                    <span>Progression : {progressPercent}%</span>
                    {isFinished && (
                      <span className="text-green-700 font-bold bg-green-50 px-2 py-0.5 rounded-full border border-green-200 text-[11px] animate-pulse">
                        Terminé !
                      </span>
                    )}
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isFinished
                          ? "bg-green-500 w-full"
                          : "bg-gradient-to-r from-indigo-500 to-indigo-700"
                      }`}
                      style={{
                        width: `${progressPercent}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
