import fs from 'node:fs';
import cards from '../src/data/cards.json' with {type:'json'};
import {SKILLS,ADAPTIVE_COURSE_IDS,SKILL_BY_ID} from '../src/lib/catalog.mjs';
import {newProfile,grade,mastery,startSession,advanceSession} from '../src/lib/engine.mjs';

for(const skill of SKILLS)if(!cards.some(card=>ADAPTIVE_COURSE_IDS.includes(card.courseId)&&card.skillId===skill.id))throw new Error(`自适应课程缺少目标 ${skill.id}`);

function simulate(mixed){
  let profile=newProfile(),questions=0,rounds=0,shortRounds=0,run=0,last='',maxRun=0,repeated=0,withinRoundDuplicates=0;
  const wrongOnce=new Set(),used=new Set(),courses=ADAPTIVE_COURSE_IDS;
  for(let guard=0;guard<5000;guard++){
    const complete=SKILLS.every(skill=>mastery(skill,profile.bySkill[skill.id]))&&!Object.values(profile.pending).some(value=>value.queue==='practice');
    if(complete)return {completed:true,questions,rounds,shortRounds,mastered:SKILLS.length,pending:0,longestTargetRun:maxRun,repeatedScenes:repeated,withinRoundDuplicates};
    if(!profile.session||profile.session.finished){
      profile=startSession(profile,cards,{mode:'practice',courses});rounds++;
      if(!profile.session||profile.session.finished)throw new Error('缺题');
    }
    const card=cards.find(candidate=>candidate.id===profile.session.cardId),wrong=mixed&&!wrongOnce.has(card.skillId);
    wrongOnce.add(card.skillId);
    const option=card.options.find(candidate=>wrong?!card.answerIds.includes(candidate.id):card.answerIds.includes(candidate.id));
    if(used.has(card.id))repeated++;used.add(card.id);
    if(profile.session.recent.includes(card.id))withinRoundDuplicates++;
    run=last===card.skillId?run+1:1;last=card.skillId;maxRun=Math.max(maxRun,run);
    profile=grade(profile,card,{questionId:profile.session.questionId,answer:option.text,cards}).profile;questions++;
    profile=advanceSession(profile,cards);
    if(profile.session.finished&&profile.session.answered<12)shortRounds++;
  }
  return {completed:false,questions,rounds,shortRounds,mastered:SKILLS.filter(skill=>mastery(skill,profile.bySkill[skill.id])).length,pending:Object.keys(profile.pending).length,withinRoundDuplicates,
    remaining:SKILLS.filter(skill=>!mastery(skill,profile.bySkill[skill.id])).map(skill=>({id:skill.id,stats:profile.bySkill[skill.id],needed:skill.coverage}))};
}

const results={perfect:simulate(false),firstWrongThenCorrect:simulate(true)};
console.log(JSON.stringify(results,null,2));
if(process.argv.includes('--output'))fs.writeFileSync(process.argv[process.argv.indexOf('--output')+1],JSON.stringify(results,null,2)+'\n');
if(Object.values(results).some(result=>!result.completed||result.withinRoundDuplicates))process.exitCode=1;

for(const card of cards)if(!SKILL_BY_ID.has(card.skillId))throw new Error(`未知目标 ${card.id}`);
