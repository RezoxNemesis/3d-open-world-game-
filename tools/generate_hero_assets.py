"""Original MIT sculpted guardian and human head. Blender4.3, meters, no external art.
Godot design coordinates are converted to Blender Z-up before glTF export.
"""
import sys
import math
import json
from pathlib import Path
import bpy
from mathutils import Vector
sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_celestial_dragon import Sculpt, read_glb, values
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/models/heroes'
OUT.mkdir(parents=True, exist_ok=True)

def v(p): return Vector((p[0], -p[2], p[1]))

def material(name, color, metallic=0., roughness=.72, emission=0.):
    m=bpy.data.materials.new(name);m.use_nodes=True
    n=m.node_tree.nodes.get('Principled BSDF')
    n.inputs['Base Color'].default_value=(*color,1)
    n.inputs['Metallic'].default_value=metallic
    n.inputs['Roughness'].default_value=roughness
    if emission:
        n.inputs['Emission Color'].default_value=(*color,1)
        n.inputs['Emission Strength'].default_value=emission
    m.diffuse_color=(*color,1)
    return m

class Model:
    def __init__(self, materials): self.materials=materials;self.groups={}
    def group(self, joint, mat):
        return self.groups.setdefault((joint,mat), Sculpt())
    def oval(self,j,m,p,r,seg=16,rings=9):
        self.group(j,m).ellipsoid(m,v(p),(r[0],r[2],r[1]),seg,rings,bone=0)
    def tube(self,j,m,points,radii,sides=9):
        self.group(j,m).tube(m,[v(p) for p in points],radii,sides,bone=0)
    def output(self,name,pivots,organic):
        bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
        joints={}
        for key,p in pivots.items():
            ob=bpy.data.objects.new(key,None);bpy.context.collection.objects.link(ob)
            ob.location=v(p);joints[key]=ob
        for (joint,mat),sculpt in self.groups.items():
            mesh=bpy.data.meshes.new(joint+'_'+mat)
            mesh.from_pydata(sculpt.vertices,[],sculpt.faces);mesh.update()
            ob=bpy.data.objects.new(joint+'_'+mat,mesh);bpy.context.collection.objects.link(ob)
            ob.data.materials.append(self.materials[mat])
            bpy.context.view_layer.objects.active=ob;ob.select_set(True)
            if (joint,mat) in organic:
                size,target=organic[(joint,mat)]
                mod=ob.modifiers.new('Connected sculpt surface','REMESH');mod.mode='VOXEL';mod.voxel_size=size;mod.use_smooth_shade=True
                bpy.ops.object.modifier_apply(modifier=mod.name)
                mod=ob.modifiers.new('Sculpt smoothing','SMOOTH');mod.factor=.65;mod.iterations=4
                bpy.ops.object.modifier_apply(modifier=mod.name)
                triangles=sum(len(p.vertices)-2 for p in ob.data.polygons)
                if triangles>target:
                    mod=ob.modifiers.new('Mobile topology','DECIMATE');mod.ratio=target/triangles
                    bpy.ops.object.modifier_apply(modifier=mod.name)
            mod=ob.modifiers.new("Explicit tangent topology", "TRIANGULATE")
            bpy.ops.object.modifier_apply(modifier=mod.name)
            mesh=ob.data
            for p in mesh.polygons:p.use_smooth=(joint,mat) in organic
            # Deterministic planar UVs retain scale; surface color adds gentle crevice variation.
            uv=mesh.uv_layers.new(name='SurfaceUV')
            for polygon in mesh.polygons:
                axis=max(range(3), key=lambda k: abs(polygon.normal[k]))
                axes=[k for k in range(3) if k != axis]
                for index in polygon.loop_indices:
                    co=mesh.vertices[mesh.loops[index].vertex_index].co
                    uv.data[index].uv=(co[axes[0]]*.7,co[axes[1]]*.7)
            if joint in joints:
                pivot=v(pivots[joint]);
                for vert in mesh.vertices:vert.co-=pivot
                ob.parent=joints[joint];ob.location=(0,0,0)
            ob.select_set(False)
        bpy.ops.object.select_all(action='SELECT')
        path=OUT/(name+'.glb')
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_materials='EXPORT',export_tangents=True,export_animations=False,export_cameras=False,export_lights=False)
        report=verify(path);print('HERO_ASSET',report);return report

def verify(path):
    doc, binary = read_glb(path)
    triangles=0; surfaces=0
    for mesh in doc['meshes']:
        for part in mesh['primitives']:
            surfaces+=1
            attrs=part['attributes']
            assert {'POSITION','NORMAL','TEXCOORD_0'} <= set(attrs)
            points=values(doc,binary,attrs['POSITION'])
            normals=values(doc,binary,attrs['NORMAL'])
            assert all(math.isfinite(c) for p in points for c in p)
            assert all(abs(sum(c*c for c in n)-1)<.025 for n in normals)
            triangles+=doc['accessors'][part['indices']]['count']//3
    return {'file':path.name,'triangles':triangles,'surfaces':surfaces,'bytes':path.stat().st_size,'verified':'Finite positions, unit normals, UVs and serialized indices'}

def guardian():
    mats={
        'Jade':material('GuardianJade',(.105,.27,.25),.16,.54),
        'Mane':material('GuardianMane',(.025,.075,.085),.03,.8),
        'Gold':material('GuardianGold',(.55,.33,.085),.72,.33),
        'Ivory':material('GuardianIvory',(.76,.71,.50),.1,.45),
        'Ink':material('GuardianInk',(.015,.025,.024),0,.45),
        'Eye':material('GuardianEye',(.38,.88,.65),.1,.25,.45),
    }
    a=Model(mats)
    for p,r in [((0,2,0),(1.02,.8,1.65)),((0,2.3,.8),(1.12,.95,1.0)),((0,2.85,1.15),(.72,.9,.64)),((0,1.8,-1.2),(.96,.7,.72))]:a.oval('Body','Jade',p,r)
    for s in (-1,1):
        for p,r in [((s*.83,1.55,-1.05),(.52,.78,.6)),((s*.87,.9,-1.35),(.29,.55,.32)),((s*.86,.35,-.97),(.29,.31,.38)),((s*.86,.19,-.65),(.39,.19,.57))]:a.oval('Body','Jade',p,r)
        joint='Foreleg0' if s<0 else 'Foreleg1'
        for p,r in [((s*.94,1.77,1.1),(.45,.58,.48)),((s*.98,1.02,1.21),(.27,.62,.29)),((s*.98,.28,1.36),(.38,.27,.52))]:a.oval(joint,'Jade',p,r)
        for x in (-.24,0,.24):
            a.oval(joint,'Jade',(s*.98+x,.19,1.62),(.14,.15,.25),12,7)
            a.tube(joint,'Ivory',[(s*.98+x,.22,1.72),(s*.98+x,.20,1.94),(s*.98+x,.09,2.02)],[.095,.065,.001])
        # Layered curved scale rows follow the torso's elliptical contour.
        for row in range(5):
            for col in range(9):
                z=-1.38+col*.34+(row%2)*.12
                theta=.2+row*.27
                a.oval('Body','Gold' if row==0 else 'Jade',(s*math.sin(theta)*1.07,2.08+math.cos(theta)*.87,z),(.15,.085,.23),8,5)
    for p,r in [((0,3.52,1.72),(.68,.62,.63)),((0,3.29,2.35),(.55,.28,.68)),((0,3.04,2.31),(.46,.18,.62))]:a.oval('Head','Jade',p,r,24,14)
    for s in (-1,1):
        a.oval('Head','Jade',(s*.51,3.38,2.0),(.30,.36,.40),20,11)
        a.oval('Head','Ink',(s*.51,3.67,2.19),(.23,.085,.14),16,9)
        a.oval('Head','Eye',(s*.54,3.68,2.29),(.15,.045,.07),16,9)
        a.oval('Head','Ink',(s*.54,3.68,2.35),(.024,.042,.019),12,7)
        a.tube('Head','Gold',[(s*.23,3.74,2.25),(s*.49,3.80,2.28),(s*.76,3.85,2.11)],[.045,.060,.012],10)
        a.oval('Head','Ink',(s*.21,3.36,2.94),(.13,.075,.075),12,7)
        a.tube('Head','Ink',[(s*.08,3.12,2.93),(s*.36,3.1,2.76),(s*.47,3.06,2.40)],[.022,.025,.008],8)
        a.tube('Head','Ivory',[(s*.35,3.17,2.73),(s*.36,2.95,2.72),(s*.31,2.88,2.64)],[.065,.04,.001])
        a.tube('Head','Ivory',[(s*.42,3.93,1.65),(s*.60,4.40,1.37),(s*.78,4.94,1.27),(s*1.1,5.28,1.60),(s*1.22,5.43,1.90)],[.18,.15,.10,.055,.001],12)
        a.tube('Head','Ivory',[(s*.72,4.78,1.29),(s*1.18,4.98,.98),(s*1.4,5.2,1.08)],[.09,.055,.001],10)
        a.tube('Head','Gold',[(s*.36,3.28,2.91),(s*.95,3.13,3.02),(s*1.47,3.28,2.83),(s*1.68,3.60,2.47)],[.047,.033,.023,.001],9)
        # Swept layered mane, not straight cones or wooden ribs.
        for i in range(10):
            y=3.72-i*.145; x=s*(.48+.12*math.sin(i*.3)); z=1.36-i*.085
            a.tube('Head','Mane',[(x,y,z),(x+s*.37,y-.08,z-.15),(x+s*.55,y-.35,z-.25),(x+s*.48,y-.67,z-.40)],[.15,.20,.11,.001],9)
        for i in range(6):
            a.tube('Head','Ivory',[(s*(.2+i*.045),3.02,2.42-i*.035),(s*(.25+i*.05),2.80,2.40),(s*(.14+i*.05),2.49,2.15)],[.07,.06,.001],8)
    # Forehead crest and curled tail integrate the creature's silhouette.
    a.tube('Head','Gold',[(0,3.63,2.30),(0,3.94,2.06),(0,4.07,1.69)],[.035,.11,.025],10)
    tail=[(0,2,-1.42),(.38,2.08,-2.1),(.90,2.45,-2.70),(1.38,2.9,-3.08),(1.45,3.3,-3.48),(1.13,3.52,-3.83)]
    a.tube('Body','Jade',tail,[.35,.30,.24,.16,.10,.025],12)
    for i in range(7):a.tube('Body','Mane',[tail[-2],(1.05+i*.09,3.5,-3.95),(1.3+i*.08,3.25-i*.08,-4.35)],[.10,.13,.001],8)
    return a.output('jade_sentinel',{'Body':(0,0,0),'Head':(0,3,1.3),'Foreleg0':(-.94,2.1,1.1),'Foreleg1':(.94,2.1,1.1)}, {('Body','Jade'):(.065,4800),('Head','Jade'):(.025,3600),('Foreleg0','Jade'):(.035,1200),('Foreleg1','Jade'):(.035,1200)})

def human():
    mats={key:material(key,(.7,.7,.7)) for key in ['skin','hair','face','ivory','gold']}
    a=Model(mats);j='Portrait'
    for p,r in [((0,1.577,0),(.092,.119,.085)),((0,1.50,-.02),(.068,.061,.066)),((0,1.473,-.026),(.045,.030,.049)),((0,1.557,-.080),(.015,.034,.021)),((0,1.538,-.098),(.021,.013,.016))]:a.oval(j,'skin',p,r,24,14)
    for s in (-1,1):
        a.oval(j,'skin',(s*.064,1.544,-.047),(.030,.040,.035),16,9)
        a.oval(j,'skin',(s*.092,1.558,.0),(.016,.027,.015),16,9)
        a.oval(j,'face',(s*.040,1.576,-.077),(.028,.011,.011),16,8)
        a.oval(j,'ivory',(s*.040,1.576,-.085),(.021,.007,.006),16,8)
        a.oval(j,'hair',(s*.039,1.576,-.090),(.007,.007,.0035),12,7)
        a.tube(j,'hair',[(s*.017,1.595,-.084),(s*.039,1.598,-.083),(s*.064,1.591,-.067)],[.003,.004,.001],7)
        a.tube(j,'face',[(0,1.507,-.090),(s*.017,1.509,-.086),(s*.027,1.510,-.079)],[.002,.0025,.0005],6)
        # Tapered swept locks frame the face and a tied half-up hairstyle.
        for i in range(7):
            x=s*(.016+i*.011)
            a.tube(j,'hair',[(x,1.682,.008),(x+s*.008,1.679,-.040),(x+s*.012,1.642,-.082),(x+s*.018,1.602-i*.007,-.070)],[.018,.021,.014,.001],7)
        for i in range(6):
            x=s*(.018+i*.012)
            a.tube(j,'hair',[(x,1.67,.025),(x+s*.005,1.62,.081),(x+s*.008,1.54,.075),(x+s*.013,1.47,.050)],[.02,.024,.018,.001],7)
    a.oval(j,'hair',(0,1.661,.025),(.087,.050,.071),20,10)
    a.oval(j,'hair',(0,1.684,.080),(.041,.038,.041),16,9)
    a.tube(j,'hair',[(0,1.673,.10),(.018,1.59,.123),(.012,1.50,.13),(-.015,1.43,.105)],[.025,.022,.016,.002],9)
    a.tube(j,'gold',[(-.069,1.696,.078),(.069,1.696,.078)],[.004,.004],8)
    return a.output('traveler_portrait',{}, {(j,'skin'):(.0045,1350)})

records=[guardian(),human()]
(OUT/'manifest.json').write_text(json.dumps({'generator':'tools/generate_hero_assets.py','license':'MIT — original project art','units':'meters','source':'Original mathematical sculpt/curves only; no external models or reference pixels','assets':records},indent=2)+'\n')
