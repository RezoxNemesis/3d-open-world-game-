extends RefCounted
## A bounded 1,152 m sea destination. Integer sectors keep shore/seabed samples continuous.

const CENTER_SECTOR := Vector2i(256, 0)
const BOUNDARY_METERS := 576.0
const WATER_HEIGHT := 0.0
const NATURE := preload("res://scripts/nature.gd")
const PALETTE := preload("res://scripts/architectural_palette.gd")
const CREATURE := preload("res://scripts/expedition_sea_creature.gd")
const WATER_SHADER := """
shader_type spatial;
render_mode cull_disabled;
uniform vec2 sector_offset;
varying vec3 sea_point;
void vertex(){ sea_point=VERTEX; }
void fragment(){
 vec2 p=sea_point.xz+sector_offset;
 float wave=sin(p.x*0.22+TIME*0.8)+sin(p.y*0.31-TIME*0.6);
 float glint=pow(max(0.0,sin(p.x*0.56+p.y*0.4+TIME)),18.0);
 ALBEDO=mix(vec3(0.025,0.18,0.22),vec3(0.07,0.34,0.39),wave*0.22+0.5);
 ALBEDO+=vec3(0.18,0.25,0.22)*glint*0.28;
 ROUGHNESS=0.24; METALLIC=0.22;
 NORMAL_MAP=normalize(vec3(cos(p.x*0.22+TIME*0.8)*0.12,cos(p.y*0.31-TIME*0.6)*0.12,1.0))*.5+.5;
}
"""
const FLOOR_SHADER := """
shader_type spatial;
uniform vec2 sector_offset;
varying vec3 floor_point;
void vertex(){ floor_point=VERTEX; }
void fragment(){
 vec2 p=floor_point.xz+sector_offset;
 float sand=sin(p.x*2.1+sin(p.y*0.8))*0.5+0.5;
 float caustic=pow(max(0.0,sin(p.x*0.6+TIME*.6)*cos(p.y*.8+TIME*.4)),8.0);
 ALBEDO=mix(vec3(.28,.36,.27),vec3(.45,.49,.32),sand*.35);
 EMISSION=vec3(.07,.16,.12)*caustic;
 ROUGHNESS=.92;
}
"""
static var _surface_material: ShaderMaterial
static var _floor_material: ShaderMaterial


static func is_sector(key: Vector2i) -> bool:
	return absi(key.x - CENTER_SECTOR.x) <= 4 and absi(key.y - CENTER_SECTOR.y) <= 4


static func relative_point(key: Vector2i, local: Vector3) -> Vector3:
	return Vector3(
		(key.x - CENTER_SECTOR.x) * 128.0 + local.x,
		local.y,
		(key.y - CENTER_SECTOR.y) * 128.0 + local.z
	)


static func floor_height(key: Vector2i, local: Vector3) -> float:
	var point := relative_point(key, local)
	var edge := maxf(absf(point.x), absf(point.z))
	var shore := smoothstep(448.0, BOUNDARY_METERS, edge)
	var bed := -18.0 + sin(point.x * 0.021) * cos(point.z * 0.017) * 1.3
	return lerpf(bed, 0.6, shore)


static func is_water(key: Vector2i, local: Vector3) -> bool:
	var point := relative_point(key, local)
	return maxf(absf(point.x), absf(point.z)) < BOUNDARY_METERS and floor_height(key, local) < -1.2


static func build(region: Node3D, key: Vector2i, world: Node3D) -> Node3D:
	var existing := region.get_node_or_null("AzureSea") as Node3D
	if existing != null:
		return existing
	var sea := Node3D.new()
	sea.name = "AzureSea"
	region.add_child(sea)
	if _surface_material == null:
		_surface_material = ShaderMaterial.new()
		_surface_material.shader = Shader.new()
		_surface_material.shader.code = WATER_SHADER
		_floor_material = ShaderMaterial.new()
		_floor_material.shader = Shader.new()
		_floor_material.shader.code = FLOOR_SHADER
	var offset := Vector2(key - CENTER_SECTOR) * 128.0
	var floor_mesh := region.get_node_or_null("WalkableTerrain") as MeshInstance3D
	if floor_mesh != null:
		var floor_material := _floor_material.duplicate() as ShaderMaterial
		floor_material.set_shader_parameter("sector_offset", offset)
		floor_mesh.material_override = floor_material
	var water := MeshInstance3D.new()
	water.name = "OceanSurface"
	var plane := PlaneMesh.new()
	plane.size = Vector2(128, 128)
	water.mesh = plane
	var water_material := _surface_material.duplicate() as ShaderMaterial
	water_material.set_shader_parameter("sector_offset", offset)
	water.material_override = water_material
	water.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	sea.add_child(water)
	_decorate(sea, key)
	if key == CENTER_SECTOR:
		var creature := CREATURE.new()
		sea.add_child(creature)
		creature.setup(world)
	return sea


static func _decorate(parent: Node3D, key: Vector2i) -> void:
	var nature := NATURE.new()
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(key) + 42719
	var stems: Array[Transform3D] = []
	var stem_colors: Array[Color] = []
	var coral: Array[Transform3D] = []
	var coral_colors: Array[Color] = []
	var stones: Array[Transform3D] = []
	var stone_colors: Array[Color] = []
	var grass: Array[Transform3D] = []
	var grass_colors: Array[Color] = []
	for colony in range(12):
		var root := Vector3(rng.randf_range(-53, 53), 0, rng.randf_range(-53, 53))
		root.y = floor_height(key, root)
		if root.y > -2.0:
			continue
		var size := rng.randf_range(0.8, 2.0)
		stones.append(Transform3D(Basis.IDENTITY.scaled(Vector3(size * 2, size * 0.8, size)), root))
		stone_colors.append(Color("74887e"))
		for branch in range(6):
			var angle := branch * 2.399
			var base := root + Vector3(cos(angle), 0, sin(angle)) * 0.5
			var tip := (
				base + Vector3(cos(angle) * 0.65, rng.randf_range(0.8, 2.2), sin(angle) * 0.65)
			)
			stems.append(nature.branch_transform(base, tip, 0.09))
			stem_colors.append(Color("b98b83"))
			for twig in range(3):
				var point := (
					tip
					+ Vector3(
						rng.randf_range(-.4, .4), rng.randf_range(-.3, .4), rng.randf_range(-.4, .4)
					)
				)
				coral.append(Transform3D(Basis.IDENTITY.scaled(Vector3(.3, .5, .3)), point))
				coral_colors.append(Color("d2a2a0").lerp(Color("8cadb0"), rng.randf()))
			grass.append(
				Transform3D(
					Basis(Vector3.UP, angle).scaled(Vector3(1.8, 2.5, 1.8)), base + Vector3(1, 0, 0)
				)
			)
			grass_colors.append(Color("568579"))
	var coral_mesh := SphereMesh.new()
	coral_mesh.radial_segments = 6
	coral_mesh.rings = 2
	coral_mesh.material = nature.surface(Color.WHITE)
	var rock := SphereMesh.new()
	rock.radial_segments = 6
	rock.rings = 2
	rock.material = nature.surface(Color.WHITE)
	_batch(nature, parent, "CoralBranches", nature._bark_mesh(), stems, stem_colors)
	_batch(nature, parent, "CoralPolyps", coral_mesh, coral, coral_colors)
	_batch(nature, parent, "SeabedRocks", rock, stones, stone_colors)
	_batch(nature, parent, "SeaGrass", nature.grass_mesh(), grass, grass_colors)
	if key == CENTER_SECTOR:
		_ruins(parent, nature)


static func _batch(
	nature: RefCounted,
	parent: Node3D,
	label: String,
	mesh: Mesh,
	transforms: Array[Transform3D],
	colors: Array[Color]
) -> void:
	if transforms.is_empty():
		return
	nature.batch_group(parent, label, mesh, transforms, colors, false)
	var item := parent.get_child(parent.get_child_count() - 1) as MultiMeshInstance3D
	item.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	item.visibility_range_end = 100


static func _ruins(parent: Node3D, nature: RefCounted) -> void:
	var blocks: Array[Transform3D] = []
	var colors: Array[Color] = []
	var stone := BoxMesh.new()
	var material := PALETTE.material_for("Stone").duplicate() as StandardMaterial3D
	material.vertex_color_use_as_albedo = true
	material.uv1_triplanar = true
	material.uv1_scale = Vector3.ONE * .6
	stone.material = material
	for side in [-1, 1]:
		for z in [-20.0, -12.0]:
			blocks.append(
				Transform3D(
					Basis.IDENTITY.scaled(Vector3(1.1, 5.0, 1.1)), Vector3(side * 5, -15.5, z)
				)
			)
			colors.append(Color("a2b6a7"))
		blocks.append(
			Transform3D(
				Basis.IDENTITY.scaled(Vector3(1.4, .9, 11.5)), Vector3(side * 5, -12.8, -16)
			)
		)
		colors.append(Color("a2b6a7"))
	blocks.append(Transform3D(Basis.IDENTITY.scaled(Vector3(12, .8, 1.5)), Vector3(0, -12.7, -20)))
	colors.append(Color("b8c3ad"))
	# Broad footings and broken lintel fragments ground the gate in its sand bed.
	for side in [-1, 1]:
		for z in [-20.0, -12.0]:
			blocks.append(
				Transform3D(
					Basis.IDENTITY.scaled(Vector3(2.1, .7, 2.1)), Vector3(side * 5, -17.7, z)
				)
			)
			colors.append(Color("789283"))
	for fragment in range(7):
		var angle := fragment * 2.399
		var point := Vector3(cos(angle) * 8, -17.5, -16 + sin(angle) * 7)
		var basis := (
			Basis.from_euler(Vector3(.12, angle, .08)) * Basis.from_scale(Vector3(1.4, .7, 2.2))
		)
		blocks.append(Transform3D(basis, point))
		colors.append(Color("7a9284"))
	_batch(nature, parent, "DrownedGateRuins", stone, blocks, colors)
	var solid := StaticBody3D.new()
	solid.name = "DrownedGateCollision"
	for placement: Transform3D in blocks:
		var collision := CollisionShape3D.new()
		var box := BoxShape3D.new()
		box.size = placement.basis.get_scale()
		collision.shape = box
		collision.transform = Transform3D(placement.basis.orthonormalized(), placement.origin)
		solid.add_child(collision)
	parent.add_child(solid)
	var marker := Node3D.new()
	marker.name = "DrownedGateDiscovery"
	marker.position = Vector3(0, -14, -16)
	parent.add_child(marker)
