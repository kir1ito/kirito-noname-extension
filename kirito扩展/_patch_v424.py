# -*- coding: utf-8 -*-
# v4.24: 去除无上神/龙神赵云自制武将（含语音/立绘/动皮），保留全部自制技能+进度条+特殊渲染+灌顶
import io

p = r'D:\game\noname\learn\kirito扩展\extension.js'
s = io.open(p, encoding='utf-8').read()
n0 = len(s)

def cut(start_marker, end_marker, label):
    global s
    a = s.find(start_marker)
    assert a >= 0, 'start not found: ' + label
    b = s.find(end_marker, a)
    assert b >= 0, 'end not found: ' + label
    b += len(end_marker)
    s = s[:a] + s[b:]
    print('cut', label, b - a, 'chars')

# ① 立绘镜像两行
cut(
    '\t\t\t\tcopyFile("extension/kirito扩展/wushangshen.jpg", "image/character/wushangshen.jpg");\n',
    '\t\t\t\tcopyFile("extension/kirito扩展/god.jpg", "image/character/god.jpg");\n',
    'portrait mirrors')

# ② 动皮注入+自愈守望块（注释头到watchdog收尾）
cut(
    '\t\t\t// 十周年UI动皮配置：素材与配置完全自持（assets/dynamic/神马超/风霆啸野 为十周年UI同名动皮的完整副本）。\n',
    '\t\t\t}, 3000);\n',
    'dynamic skin injection + watchdog')

# ③ 灌顶排除无上神检查块
cut(
    '\t\t\t\t\t\t// 无上神自带〖降临〗可自行挑选技能，默认排除不重复灌顶（可关掉排除开关）\n',
    '\t\t\t\t\t\t}\n',
    'guanding wss exclusion check')

# ④ guandingExcludeWss 配置项整块
cut(
    '\t\t\tguandingExcludeWss: {\n',
    '\t\t\t\tinit: true,\n\t\t\t},\n',
    'guandingExcludeWss config item')

# ⑤ touyingPool 注释行更新
old_c = '\t\t\t// 降临技能池：管理无上神〖降临〗局内可选的技能（默认本扩展全部技能，可增删，上限20）'
new_c = '\t\t\t// 降临技能池：管理自制技〖降临〗(grytouying)局内可选的技能（默认本扩展全部技能，可增删，上限20）'
assert old_c in s, 'touyingPool comment'
s = s.replace(old_c, new_c)

# ⑥ autoAddSkills intro 去掉无上神尾句
old_a = '池子为空则无效果。无上神默认不参与灌顶",'
new_a = '池子为空则无效果",'
assert old_a in s, 'autoAddSkills intro'
s = s.replace(old_a, new_a)

# ⑦ character包 → 空骨架
old_pkg = (
    '\t\t\tpackage: {\n'
    '\t\t\t\tcharacter: {\n'
    '\t\t\t\t\t// 声明为国战角色包：加载时加入 lib.characterGuozhanFilter，开启"仅国战武将"时也能入选\n'
    '\t\t\t\t\tmode: "guozhan",\n'
)
new_pkg = '\t\t\tpackage: {\n\t\t\t\tcharacter: {\n'
assert old_pkg in s, 'package head'
s = s.replace(old_pkg, new_pkg)

old_tail = (
    '\t\t\t\ttranslate: {\n'
    '\t\t\t\t\tgod: "龙神赵云",\n'
    '\t\t\t\t\twushangshen: "无上神",\n'
    '\t\t\t\t},\n'
    '\t\t\t\tcharacterIntro: {\n'
    '\t\t\t\t\twushangshen: "kirito的自制的无上神武将",\n'
    '\t\t\t\t},\n'
    '\t\t\t},\n'
)
new_tail = '\t\t\t},\n'
assert old_tail in s, 'package tail'
s = s.replace(old_tail, new_tail)

# 中段（character:{}到translate:之间的两个武将定义）整体删除：从"以本体神赵云"注释到character: {}闭合前
a = s.find('\t\t\t\t\t// 以本体神赵云(character/extra.js:shen_zhaoyun)为底')
assert a >= 0, 'god comment'
b = s.find('\t\t\t\t\tcharacter: {}', a)
# 空骨架里没有character:{}；改用 translate: { 定位：删掉 god/wushangshen 两个 Character 定义块
b = s.find('\t\t\t\t},\n\t\t\t\ttranslate: {', a)
assert b >= 0, 'translate anchor'
s = s[:a] + s[b + len('\t\t\t\t},\n'):]
# 此时 character: {} 开头空的——补空对象体
s = s.replace('\t\t\t\tcharacter: {\n\t\t\t\ttranslate: {', '\t\t\t\tcharacter: {},\n\t\t\t\ttranslate: {')

# ⑧ 版本号
old_v = 'const VERSION = "4.23";'
assert old_v in s, 'version'
s = s.replace(old_v, 'const VERSION = "4.24";')

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('done. size', n0, '->', len(s))
