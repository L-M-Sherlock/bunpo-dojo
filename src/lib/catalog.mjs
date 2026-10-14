import scope from '../../content/scope.json' with {type:'json'};
import requirements from '../../content/requirements.json' with {type:'json'};
import articleReference from '../../content/references/haya-pairs.json' with {type:'json'};
import sitePairClassification from '../../content/references/site-pair-classification.json' with {type:'json'};
import pairFrequencyOrder from '../../content/references/pair-frequency-order.json' with {type:'json'};
export const PAIR_COUNT=scope.pairs.length;
export const COURSES=[
  {id:'location',title:'存在与活动地点',subtitle:'に · で',description:'区分在哪里存在与在哪里做事。',group:'particles'},
  {id:'movement',title:'移动与路径',subtitle:'に · へ · を',description:'辨析目的地、乘坐对象、离开位置与经过路径。',group:'particles'},
  {id:'relations',title:'时间与其他关系',subtitle:'に · で',description:'辨析时间、接受者、工具和移动目的。',group:'particles'},
  {id:'mixed',title:'综合用法辨析',subtitle:'在完整场景中选择',description:'结合施事、对象、地点和目的地，辨析当前目标。',group:'mixed'},
  {id:'pairs',title:'自动词与他动词',subtitle:'25 种词形对应 · 语境辨析',description:`按25种常见词形对应整理；${PAIR_COUNT-articleReference.mapping.length}组高频补充词对也归入相应模式。`,group:'verbs'},
];
// Mixed is a selectable scene set; its targets belong to the four full courses.
export const ADAPTIVE_COURSE_IDS=COURSES.filter(c=>c.group!=='mixed').map(c=>c.id);
const orderedArticleRows=[...articleReference.mapping].sort((a,b)=>a.group-b.group||a.row-b.row||(a.variant??1)-(b.variant??1));
const articleSkillIds=[...new Set(orderedArticleRows.map(row=>row.skillId))],articleSkillSet=new Set(articleSkillIds);
const scopePairById=new Map(scope.pairs.map(pair=>[pair.id,pair]));
const supplementalSkillIds=scope.pairs.filter(pair=>!articleSkillSet.has(pair.id)).map(pair=>pair.id);
const supplementalAssignments=[...sitePairClassification.assignments].sort((a,b)=>a.group-b.group||a.skillId.localeCompare(b.skillId));
const assignedSupplementalIds=new Set(supplementalAssignments.map(entry=>entry.skillId));
if(supplementalSkillIds.some(id=>!assignedSupplementalIds.has(id))||assignedSupplementalIds.size!==supplementalSkillIds.length)throw new Error('本站补充词对分类不完整');
export const PAIR_FREQUENCY_BY_SKILL=new Map(pairFrequencyOrder.orderedSkillIds.map((id,index)=>[id,{overallOrder:index+1}]));
const frequencyOrder=new Map(pairFrequencyOrder.orderedSkillIds.map((id,index)=>[id,index]));
if(frequencyOrder.size!==scope.pairs.length||scope.pairs.some(pair=>!frequencyOrder.has(pair.id)))throw new Error('词对词频排序不完整');
export const PAIR_GROUPS=[...articleReference.groupDefinitions.map(definition=>{
  const order=definition.group,articleSkillIds=orderedArticleRows.filter(row=>row.group===order).map(row=>row.skillId),
    supplementalSkillIds=supplementalAssignments.filter(entry=>entry.group===order).map(entry=>entry.skillId),skillIds=[...articleSkillIds,...supplementalSkillIds].sort((a,b)=>frequencyOrder.get(a)-frequencyOrder.get(b)),
    title=definition.sameForm?'自动词与他动词同形':`自动 ${definition.intransitiveSuffix} ／ 他动 ${definition.transitiveSuffix}`,
    label=definition.sameForm?`自动词与他动词同形（均为${definition.intransitiveClass}）`:`自动 ${definition.intransitiveSuffix}（${definition.intransitiveClass}）／ 他动 ${definition.transitiveSuffix}（${definition.transitiveClass}）`;
  return {id:`article-${order}`,categoryId:`pair.category.${String(order).padStart(2,'0')}`,order,source:'haya',title,label,
    detail:`自动词：${definition.intransitiveClass} · 他动词：${definition.transitiveClass}`,articleSkillIds,supplementalSkillIds,skillIds};
})];
export const PAIR_GROUP_BY_SKILL=new Map(PAIR_GROUPS.flatMap(group=>group.skillIds.map(skillId=>[skillId,group])));
export const PAIR_CLASSIFICATION_SOURCE_BY_SKILL=new Map([...articleSkillIds.map(id=>[id,'article']),...supplementalSkillIds.map(id=>[id,'site'])]);
const orderedPairs=PAIR_GROUPS.flatMap(group=>group.skillIds).map(id=>scopePairById.get(id));
export const PARTICLE_SKILLS=scope.particleSkills.map(s=>({...s,prerequisites:[],coverage:['context']}));
export const PAIR_SKILLS=orderedPairs.map(p=>({...p,id:p.id,courseId:'pairs',title:`${p.intransitive} / ${p.transitive}`,objective:p.meaning,prerequisites:[],coverage:['intransitive','transitive']}));
// SKILLS remains the content catalog: card validation and logs resolve concrete pairs here.
export const SKILLS=[...PARTICLE_SKILLS,...PAIR_SKILLS];
export const SKILL_BY_ID=new Map(SKILLS.map(s=>[s.id,s]));
export const PAIR_CATEGORY_SKILLS=PAIR_GROUPS.map(group=>({
  id:group.categoryId,
  courseId:'pairs',
  title:`自他词形 · ${group.label}`,
  objective:group.detail,
  prerequisites:[],
  coverage:['intransitive','transitive'],
  minLexical:Math.min(3,group.skillIds.length),
  pairSkillIds:group.skillIds,
  order:group.order,
}));
// Only these 35 goals gate progress. The 172 pairs are a rotating example pool.
export const TRACKED_SKILLS=[...PARTICLE_SKILLS,...PAIR_CATEGORY_SKILLS];
export const TRACKED_SKILL_BY_ID=new Map(TRACKED_SKILLS.map(skill=>[skill.id,skill]));
export const trackingSkillIdForCard=card=>card.skillId.startsWith('particle.')?card.skillId:PAIR_GROUP_BY_SKILL.get(card.skillId)?.categoryId;
export const trackingSkillForCard=card=>TRACKED_SKILL_BY_ID.get(trackingSkillIdForCard(card));
export const REQUIREMENTS=requirements;
export const REQUIREMENT_BY_ID=new Map(requirements.map(r=>[r.id,r]));
export const SOURCE_URLS={
  'tufs-case':'https://www.coelang.tufs.ac.jp/mt/ja/gmod/contents/explanation/053.html',
  'tufs-destination':'https://www.coelang.tufs.ac.jp/mt/ja/gmod/contents/explanation/026.html',
  'jf-pairs':'https://www.kyozai.jpf.go.jp/kyozai/material/BTS00002/ja/render.do',
  'haya-pairs':'https://zhuanlan.zhihu.com/p/58662766',
  'jpdb-frequency':'https://github.com/Kuuuube/yomitan-dictionaries/blob/b1114cc014f4343d04c387c7dcd3b1171dd31782/data/jpdb_v2.2_freq_list_2024-10-13.csv',
  'jiten-frequency':'https://jiten.moe/frequency-dictionaries',
};
export const SOURCE_LABELS={
  'tufs-case':'东京外国语大学 格助词说明',
  'tufs-destination':'东京外国语大学 移动目的地说明',
  'jf-pairs':'国际交流基金 自他动词资料',
  'haya-pairs':'哈呀《日语自动词与他动词的所有对应形式》',
  'jpdb-frequency':'JPDB v2.2 词频排序资料',
  'jiten-frequency':'Jiten Global 词频辞典',
};
export const sourceFor=id=>SOURCE_URLS[id];
export const sourceLabel=id=>SOURCE_LABELS[id]??id;
