export function localDay(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function emptyStatistics(){return {questions:0,correct:0,independent:0,independentCorrect:0,assisted:0,retests:0,retestCorrect:0,activeMs:0,days:{},courses:{},errors:{},input:0,choice:0};}
export function recordStatistics(stats,event){
  const s=structuredClone(stats),day=localDay(new Date(event.at));
  const delta={questions:1,correct:Number(event.correct),independent:Number(event.independent),independentCorrect:Number(event.correct&&event.independent),assisted:Number(!event.independent),retests:Number(event.retest),retestCorrect:Number(event.retest&&event.independent&&event.correct),[event.answerMode]:1};
  for(const target of [s,s.days[day]??={},s.courses[event.courseId]??={}])for(const [key,n]of Object.entries(delta))target[key]=(target[key]??0)+n;
  if(!event.correct)s.errors[event.skillId]=(s.errors[event.skillId]??0)+1;
  return s;
}
export function recordTime(stats,fragments){const s=structuredClone(stats);for(const f of fragments){s.activeMs+=f.ms;const d=s.days[f.day]??={};d.activeMs=(d.activeMs??0)+f.ms;}return s;}
