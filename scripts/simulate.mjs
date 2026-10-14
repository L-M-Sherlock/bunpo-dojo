import fs from 'node:fs';
import cards from '../src/data/cards.json' with {type:'json'};
import {SKILLS,ADAPTIVE_COURSE_IDS,SKILL_BY_ID} from '../src/lib/catalog.mjs';
import {newProfile,nextCard,grade,mastery} from '../src/lib/engine.mjs';
for(const skill of SKILLS)if(!cards.some(c=>ADAPTIVE_COURSE_IDS.includes(c.courseId)&&c.skillId===skill.id))throw new Error(`自适应课程缺少目标 ${skill.id}`);
function simulate(mixed){
  let p=newProfile(),recent=[],run=0,last='',maxRun=0,repeated=0;
  const wrongOnce=new Set(),used=new Set(),courses=ADAPTIVE_COURSE_IDS;
  for(let i=0;i<5000;i++){
    if(SKILLS.every(s=>mastery(s,p.bySkill[s.id]))&&!Object.values(p.pending).some(v=>v.queue==='practice'))return {completed:true,questions:i,mastered:SKILLS.length,pending:0,longestTargetRun:maxRun,repeatedScenes:repeated};
    const c=nextCard(p,cards,{courses,recent,index:i});if(!c)throw new Error('缺题');
    const wrong=mixed&&!wrongOnce.has(c.skillId);wrongOnce.add(c.skillId);
    const option=c.options.find(o=>wrong?!c.answerIds.includes(o.id):c.answerIds.includes(o.id));
    if(used.has(c.id))repeated++;used.add(c.id);run=last===c.skillId?run+1:1;last=c.skillId;maxRun=Math.max(maxRun,run);
    p=grade(p,c,{questionId:`simulation-${i}`,answer:option.text,cards}).profile;recent=[...recent,c.id].slice(-36);
  }
  return {completed:false,mastered:SKILLS.filter(s=>mastery(s,p.bySkill[s.id])).length,pending:Object.keys(p.pending).length,remaining:SKILLS.filter(s=>!mastery(s,p.bySkill[s.id])).map(s=>({id:s.id,stats:p.bySkill[s.id],needed:s.coverage})),longestTargetRun:maxRun};
}
const results={perfect:simulate(false),firstWrongThenCorrect:simulate(true)};console.log(JSON.stringify(results,null,2));
if(process.argv.includes('--output'))fs.writeFileSync(process.argv[process.argv.indexOf('--output')+1],JSON.stringify(results,null,2)+'\n');
if(Object.values(results).some(r=>!r.completed))process.exitCode=1;
// A skill must remain owned by the declared course even when tested in mixed.
for(const c of cards)if(!SKILL_BY_ID.has(c.skillId))throw new Error(`未知目标 ${c.id}`);
