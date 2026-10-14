import fs from 'node:fs';
import cards from '../src/data/cards.json' with {type:'json'};
import {TRACKED_SKILLS,ADAPTIVE_COURSE_IDS,SKILL_BY_ID,trackingSkillIdForCard} from '../src/lib/catalog.mjs';
import {newProfile,grade,mastery,startSession,advanceSession} from '../src/lib/engine.mjs';

for(const skill of TRACKED_SKILLS)if(!cards.some(card=>ADAPTIVE_COURSE_IDS.includes(card.courseId)&&trackingSkillIdForCard(card)===skill.id))throw new Error(`自适应课程缺少目标 ${skill.id}`);

function simulate(mixed){
  let profile=newProfile(),questions=0,rounds=0,shortRounds=0,run=0,last='',maxRun=0,repeated=0,withinRoundDuplicates=0;
  const wrongOnce=new Set(),used=new Set(),courses=ADAPTIVE_COURSE_IDS;
  for(let guard=0;guard<5000;guard++){
    const complete=TRACKED_SKILLS.every(skill=>mastery(skill,profile.bySkill[skill.id]))&&!Object.values(profile.pending).some(value=>value.queue==='practice');
    if(complete){
      const pairSkills=TRACKED_SKILLS.filter(skill=>skill.courseId==='pairs'),sampledPairs=pairSkills.reduce((sum,skill)=>sum+(profile.bySkill[skill.id]?.lexical?.length??0),0),pairSampleOverrun=pairSkills.filter(skill=>(profile.bySkill[skill.id]?.lexical?.length??0)>(skill.minLexical??0)).length;
      return {completed:true,questions,rounds,shortRounds,mastered:TRACKED_SKILLS.length,pending:0,sampledPairs,pairSampleOverrun,longestTargetRun:maxRun,repeatedScenes:repeated,withinRoundDuplicates};
    }
    if(!profile.session||profile.session.finished){
      profile=startSession(profile,cards,{mode:'practice',courses});rounds++;
      if(!profile.session||profile.session.finished)throw new Error('缺题');
    }
    const card=cards.find(candidate=>candidate.id===profile.session.cardId),trackedId=trackingSkillIdForCard(card),wrong=mixed&&!wrongOnce.has(trackedId);
    wrongOnce.add(trackedId);
    const option=card.options.find(candidate=>wrong?!card.answerIds.includes(candidate.id):card.answerIds.includes(candidate.id));
    if(used.has(card.id))repeated++;used.add(card.id);
    if(profile.session.recent.includes(card.id))withinRoundDuplicates++;
    run=last===trackedId?run+1:1;last=trackedId;maxRun=Math.max(maxRun,run);
    profile=grade(profile,card,{questionId:profile.session.questionId,answer:option.text,cards}).profile;questions++;
    profile=advanceSession(profile,cards);
    if(profile.session.finished&&profile.session.answered<12)shortRounds++;
  }
  return {completed:false,questions,rounds,shortRounds,mastered:TRACKED_SKILLS.filter(skill=>mastery(skill,profile.bySkill[skill.id])).length,pending:Object.keys(profile.pending).length,withinRoundDuplicates,
    remaining:TRACKED_SKILLS.filter(skill=>!mastery(skill,profile.bySkill[skill.id])).map(skill=>({id:skill.id,stats:profile.bySkill[skill.id],needed:skill.coverage}))};
}

const results={perfect:simulate(false),firstWrongThenCorrect:simulate(true)};
console.log(JSON.stringify(results,null,2));
if(process.argv.includes('--output'))fs.writeFileSync(process.argv[process.argv.indexOf('--output')+1],JSON.stringify(results,null,2)+'\n');
if(Object.values(results).some(result=>!result.completed||result.withinRoundDuplicates||result.pairSampleOverrun))process.exitCode=1;

for(const card of cards)if(!SKILL_BY_ID.has(card.skillId))throw new Error(`未知目标 ${card.id}`);
