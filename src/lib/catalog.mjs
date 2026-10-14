import scope from '../../content/scope.json' with {type:'json'};
import requirements from '../../content/requirements.json' with {type:'json'};
export const PAIR_COUNT=scope.pairs.length;
export const COURSES=[
  {id:'location',title:'存在与活动地点',subtitle:'に · で',description:'区分在哪里存在与在哪里做事。',group:'particles'},
  {id:'movement',title:'移动与路径',subtitle:'に · へ · を',description:'辨析目的地、乘坐对象、离开位置与经过路径。',group:'particles'},
  {id:'relations',title:'时间与其他关系',subtitle:'に · で',description:'辨析时间、接受者、工具和移动目的。',group:'particles'},
  {id:'mixed',title:'综合用法辨析',subtitle:'在完整场景中选择',description:'结合施事、对象、地点和目的地，辨析当前目标。',group:'mixed'},
  {id:'pairs',title:'自动词与他动词',subtitle:'主语发生什么 · 动作作用于谁',description:`通过${PAIR_COUNT}组词对，结合主语、对象和语境辨认自他用法。`,group:'verbs'},
];
// Mixed is a selectable scene set; its targets belong to the four full courses.
export const ADAPTIVE_COURSE_IDS=COURSES.filter(c=>c.group!=='mixed').map(c=>c.id);
export const SKILLS=[...scope.particleSkills.map(s=>({...s,prerequisites:[],coverage:['context']})),
  ...scope.pairs.map(p=>({...p,id:p.id,courseId:'pairs',title:`${p.intransitive} / ${p.transitive}`,objective:p.meaning,prerequisites:[],coverage:['intransitive','transitive']}))];
export const SKILL_BY_ID=new Map(SKILLS.map(s=>[s.id,s]));
export const REQUIREMENTS=requirements;
export const REQUIREMENT_BY_ID=new Map(requirements.map(r=>[r.id,r]));
export const SOURCE_URLS={
  'tufs-case':'https://www.coelang.tufs.ac.jp/mt/ja/gmod/contents/explanation/053.html',
  'tufs-destination':'https://www.coelang.tufs.ac.jp/mt/ja/gmod/contents/explanation/026.html',
  'jf-pairs':'https://www.kyozai.jpf.go.jp/kyozai/material/BTS00002/ja/render.do',
  'haya-pairs':'https://zhuanlan.zhihu.com/p/58662766',
};
export const sourceFor=id=>SOURCE_URLS[id];
