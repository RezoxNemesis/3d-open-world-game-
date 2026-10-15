extends RefCounted
## Original, bounded authored destinations inside the integer-sector expedition.

const PASS_SECTOR := Vector2i(64, 0)
const IMPERIAL_SECTOR := Vector2i(128, 0)
const PALETTE := preload("res://scripts/architectural_palette.gd")
const NATURE := preload("res://scripts/nature.gd")
const GATE := preload("res://assets/models/gate.glb")
const HALL := preload("res://assets/models/celestial/sanctuary.glb")
const PAVILION := preload("res://assets/models/pavilion_far.glb")
const PLANTER := preload("res://assets/models/celestial/planter.glb")
const BURNER := preload("res://assets/models/celestial/incense_burner.glb")

# Meter-sized courses remain consistent on scaled battlements and across 128 m rebases.
const STONE_SHADER := """
shader_type spatial;
uniform vec4 stone_tint : source_color = vec4(0.46, 0.51, 0.48, 1.0);
uniform sampler2D stone_texture : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
varying vec3 stone_position;
varying vec3 stone_normal;
float hash_cell(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void vertex() {
    stone_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
    stone_normal = normalize(MODEL_NORMAL_MATRIX * NORMAL);
}
void fragment() {
    vec3 n = abs(normalize(stone_normal));
    vec2 p = n.y > 0.65 ? stone_position.xz :
        (n.x > n.z ? stone_position.zy : stone_position.xy);
    vec2 courses = p * vec2(1.0, n.y > 0.65 ? 1.0 : 2.0);
    courses.x += mod(floor(courses.y), 2.0) * 0.5;
    vec2 cell = floor(courses);
    vec2 edge = min(fract(courses), 1.0 - fract(courses));
    vec2 feather = max(fwidth(courses), vec2(0.001));
    float stone = smoothstep(0.018, 0.018 + feather.x, edge.x) *
        smoothstep(0.025, 0.025 + feather.y, edge.y);
    float grain = texture(stone_texture, p * 0.5).r;
    float shade = mix(0.80, 1.16, hash_cell(cell)) * mix(0.82, 1.12, grain);
    vec3 weathered = stone_tint.rgb * shade;
    float moss = smoothstep(0.65, 0.94, hash_cell(floor(p * 0.25)));
    weathered = mix(weathered, weathered * vec3(0.72, 0.91, 0.67), moss * 0.35);
    ALBEDO = mix(stone_tint.rgb * 0.40, weathered, stone);
    ROUGHNESS = 0.94;
}
"""
static var _stone_materials: Dictionary = {}

var _world: Node3D
var _root: Node3D
var _stone: ShaderMaterial
var _nature := NATURE.new()
var _blocks: Array[Transform3D] = []
var _block_colors: Array[Color] = []


static func is_sector(key: Vector2i) -> bool:
	return key == IMPERIAL_SECTOR or (key.y == 0 and absi(key.x - PASS_SECTOR.x) <= 1)


static func label(key: Vector2i) -> String:
	return "Imperial Terrace" if key == IMPERIAL_SECTOR else "Dragonwall Pass"


static func wall_z(x: float) -> float:
	return -16 + sin(x / 36.0) * 6


static func wall_height(x: float) -> float:
	return 8 + sin(x / 52.0) * 1.8


static func floor_height(key: Vector2i, local: Vector3, original: float) -> float:
	if key == IMPERIAL_SECTOR:
		var fade := 1.0 - smoothstep(44, 64, maxf(absf(local.x), absf(local.z)))
		return lerpf(original, 0, fade)
	var x := (key.x - PASS_SECTOR.x) * 128.0 + local.x
	var z := local.z
	var ridge := maxf(0, 4.0 - absf(z - wall_z(x)) * 0.23)
	var mountains := maxf(0, 1.0 - absf(z + 44) / 18.0)
	mountains *= 12.0 + sin(x * 0.045 + 1.2) * 4.5 + cos(x * 0.09) * 2
	var height := maxf(ridge, mountains)
	var edge := (1.0 - smoothstep(160, 192, absf(x))) * (1.0 - smoothstep(48, 64, absf(z)))
	return lerpf(original, height, edge)


func build(region: Node3D, key: Vector2i, world: Node3D) -> Node3D:
	_world = world
	_root = Node3D.new()
	_root.name = "ImperialTerrace" if key == IMPERIAL_SECTOR else "DragonwallPass"
	region.add_child(_root)
	_stone = _stone_material(key == IMPERIAL_SECTOR)
	if key == IMPERIAL_SECTOR:
		_imperial()
	else:
		_pass(key)
	if not _blocks.is_empty():
		var mesh := BoxMesh.new()
		mesh.material = _stone
		_nature.batch_group(_root, "DressedStoneCourses", mesh, _blocks, _block_colors, false)
	for item: GeometryInstance3D in _root.find_children("*", "GeometryInstance3D", true, false):
		item.set_meta("expedition_kind", "realm")
	# Natural details keep the existing density/range policy for vegetation batches.
	_groves(key)
	return _root


func _box(point: Vector3, size: Vector3, solid: bool = true, yaw: float = 0) -> void:
	var basis := Basis.from_euler(Vector3(0, yaw, 0))
	_blocks.append(Transform3D(basis.scaled(size), point))
	_block_colors.append(Color.WHITE)
	if solid:
		var shape := BoxShape3D.new()
		shape.size = size
		var body: StaticBody3D = _world._structure(_root, "FortificationStone", shape, point)
		body.basis = basis


func _model(scene: PackedScene, point: Vector3, yaw: float = 0, scale_value: float = 1) -> void:
	var model: Node3D = scene.instantiate()
	model.position = point
	model.rotation.y = yaw
	model.scale = Vector3.ONE * scale_value
	if scene not in [GATE, PAVILION]:
		PALETTE.apply(model)
	_root.add_child(model)
	var body: StaticBody3D = _world._structure(
		_root, "RealmArchitecture", _world._scene_collision(scene), point, scale_value
	)
	body.rotation.y = yaw


func _stairs(
	start: Vector3, direction: Vector3, count: int, tread: float, rise: float, width: float
) -> void:
	var along_x := absf(direction.x) > 0.5
	for index in range(count):
		var top := start.y + rise * (index + 1) / count
		var point := start + direction * ((index + 0.5) * tread)
		point.y = top / 2
		var size := (
			Vector3(tread + 0.015, top, width) if along_x else Vector3(width, top, tread + 0.015)
		)
		_box(point, size)


func _pass(key: Vector2i) -> void:
	var sector_offset := (key.x - PASS_SECTOR.x) * 128.0
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for index in range(32):
		var ax := -64.0 + index * 4
		var bx := ax + 4
		var a := Vector3(ax, wall_height(sector_offset + ax), wall_z(sector_offset + ax))
		var b := Vector3(bx, wall_height(sector_offset + bx), wall_z(sector_offset + bx))
		_wall_segment(surface, a, b)
		var midpoint := a.lerp(b, 0.5)
		var yaw := -atan2(b.z - a.z, b.x - a.x)
		for side in [-1, 1]:
			# Stair entry opens only the inner parapet, preserving the far safety wall.
			if side == 1 and absf(sector_offset + midpoint.x) < 2.1:
				continue
			var edge := midpoint + Vector3(0, 0.42, side * 2.05)
			_box(edge, Vector3(4.08, 0.84, 0.42), true, yaw)
			for crenel in [-1, 1]:
				_box(edge + Vector3(crenel, 0.65, 0), Vector3(1.05, 0.62, 0.6), false, yaw)
	surface.generate_normals()
	surface.set_material(_stone)
	var wall := MeshInstance3D.new()
	wall.name = "ContinuousWalkableRampart"
	wall.mesh = surface.commit()
	_root.add_child(wall)
	wall.create_trimesh_collision()
	if key == PASS_SECTOR:
		_stairs(Vector3(0, 0, 10), Vector3.FORWARD, 48, 0.5, 8, 3.2)
		_model(GATE, Vector3(-44, wall_height(-44), wall_z(-44)), PI / 2, 0.7)
		_model(GATE, Vector3(44, wall_height(44), wall_z(44)), PI / 2, 0.7)
		_box(Vector3(0, 0.02, 13), Vector3(5.8, 0.04, 6), false)
		_root.set_meta("stair_start", Vector3(0, 0, 10))
		_root.set_meta("rampart_entry", Vector3(0, 8, -16))
	else:
		_model(GATE, Vector3(0, wall_height(sector_offset), wall_z(sector_offset)), PI / 2, 0.7)


func _wall_segment(surface: SurfaceTool, a: Vector3, b: Vector3) -> void:
	# Tapered battered masonry follows the mountain contour, with an actual continuous deck.
	var corners: Array[Vector3] = [
		a + Vector3(0, 0, -2),
		a + Vector3(0, 0, 2),
		b + Vector3(0, 0, -2),
		b + Vector3(0, 0, 2),
		Vector3(a.x, -0.5, a.z - 2.8),
		Vector3(a.x, -0.5, a.z + 2.8),
		Vector3(b.x, -0.5, b.z - 2.8),
		Vector3(b.x, -0.5, b.z + 2.8)
	]
	for index in [
		0, 2, 1, 1, 2, 3, 4, 6, 0, 0, 6, 2, 1, 3, 5, 5, 3, 7, 4, 0, 5, 5, 0, 1, 2, 6, 3, 3, 6, 7
	]:
		var point := corners[index]
		surface.set_uv(Vector2(point.x * 0.3, point.y * 0.3))
		surface.add_vertex(point)


func _imperial() -> void:
	# Three low stone courses support a broad ceremonial court, rather than a tower block.
	_box(Vector3(0, 0.65, -26), Vector3(68, 1.3, 36))
	_box(Vector3(0, 2.3, -26), Vector3(64, 2, 34))
	_box(Vector3(0, 3.65, -26), Vector3(62, 0.7, 32))
	_stairs(Vector3(0, 0, 10), Vector3.FORWARD, 40, 0.5, 4, 6)
	_model(GATE, Vector3(0, 4, -12), 0, 1.1)
	_model(HALL, Vector3(0, 4 - 0.59 * 2, -28), 0, 2)
	for side in [-1, 1]:
		_model(PAVILION, Vector3(side * 21, 4 - 0.59 * 0.82, -27), 0, 0.82)
		_model(PLANTER, Vector3(side * 9, 4, -17), 0, 1.8)
		_model(BURNER, Vector3(side * 11, 4, -23), 0, 1.1)
		# Side ramparts have their own short stairs from the court.
		_box(Vector3(side * 31, 4.9, -26), Vector3(3, 2.2, 32))
		_stairs(Vector3(side * 23.5, 4, -15), Vector3(side, 0, 0), 12, 0.5, 2, 2.7)
		_box(Vector3(side * 32.4, 6.45, -26), Vector3(0.35, 0.9, 32))
		for index in range(14):
			_box(Vector3(side * 32.4, 7.1, -11 - index * 2.2), Vector3(0.65, 0.55, 1.1), false)
	_root.set_meta("stair_start", Vector3(0, 0, 10))
	_root.set_meta("court_entry", Vector3(0, 4, -14))
	_root.set_meta("hall_floor", Vector3(0, 4, -28))


static func _stone_material(imperial: bool) -> ShaderMaterial:
	if not _stone_materials.has(imperial):
		var material := ShaderMaterial.new()
		var shader := Shader.new()
		shader.code = STONE_SHADER
		material.shader = shader
		material.set_shader_parameter(
			"stone_tint", Color("8b9690") if imperial else Color("788580")
		)
		material.set_shader_parameter("stone_texture", PALETTE.material_for("Stone").albedo_texture)
		_stone_materials[imperial] = material
	return _stone_materials[imperial]


func _groves(key: Vector2i) -> void:
	# Four batches per sector: at most twelve extra draws across the entire mountain pass.
	# All roots are outside the stair, rampart, court, vehicle and guardian reservations.
	var rng := RandomNumberGenerator.new()
	rng.seed = 70531 + key.x * 17
	var trees: Array[Vector2] = []
	if key == IMPERIAL_SECTOR:
		trees = [
			Vector2(-40, -33),
			Vector2(-39, -10),
			Vector2(-23, 9),
			Vector2(-30, 17),
			Vector2(40, -35),
			Vector2(40, -13),
			Vector2(37, 17),
			Vector2(27, 31)
		]
	else:
		trees = [
			Vector2(-47, -37),
			Vector2(-25, -45),
			Vector2(15, -46),
			Vector2(45, -39),
			Vector2(-37, 18),
			Vector2(-25, 25),
			Vector2(43, 23),
			Vector2(51, 31)
		]
	var trunks: Array[Transform3D] = []
	var leaves: Array[Transform3D] = []
	var rocks: Array[Transform3D] = []
	var grasses: Array[Transform3D] = []
	var trunk_colors: Array[Color] = []
	var leaf_colors: Array[Color] = []
	var rock_colors: Array[Color] = []
	var grass_colors: Array[Color] = []
	for site in trees:
		var foot := Vector3(site.x, 0, site.y)
		foot.y = _world.ground_height(key, foot) - 0.12
		var height := rng.randf_range(6.4, 9.8)
		var crown := foot + Vector3(rng.randf_range(-0.8, 0.8), height, 0)
		trunks.append(_nature.branch_transform(foot, crown, 0.25))
		trunk_colors.append(Color("807565"))
		for branch in range(5):
			var angle := branch * TAU / 5 + rng.randf_range(-0.25, 0.25)
			var tip := (
				crown + Vector3(cos(angle) * 2.5, rng.randf_range(-1.4, 0.4), sin(angle) * 2.5)
			)
			trunks.append(_nature.branch_transform(foot.lerp(crown, 0.6), tip, 0.12))
			trunk_colors.append(Color("807565"))
			for cluster in range(9):
				var point := (
					tip
					+ Vector3(
						rng.randf_range(-1.5, 1.5),
						rng.randf_range(-0.3, 1.2),
						rng.randf_range(-1.5, 1.5)
					)
				)
				var basis := Basis.from_euler(Vector3(0, rng.randf() * TAU, 0))
				leaves.append(Transform3D(basis.scaled(Vector3(2.7, 1.7, 2.7)), point))
				leaf_colors.append(Color("527853").lerp(Color("9bb66b"), rng.randf() * 0.65))
		for index in range(3):
			var point := foot + Vector3(rng.randf_range(-3, 3), 0, rng.randf_range(-3, 3))
			point.y = _world.ground_height(key, point) + 0.25
			var basis := Basis.from_euler(Vector3(0.2, rng.randf() * TAU, 0.1))
			rocks.append(
				Transform3D(basis.scaled(Vector3(rng.randf_range(1.2, 2.4), 0.9, 1.6)), point)
			)
			rock_colors.append(Color("657468").lerp(Color("8c9275"), rng.randf()))
		for index in range(32):
			var point := foot + Vector3(rng.randf_range(-4.5, 4.5), 0, rng.randf_range(-4.5, 4.5))
			point.y = _world.ground_height(key, point) + 0.35
			var basis := Basis.from_euler(Vector3(0, rng.randf() * TAU, 0))
			grasses.append(Transform3D(basis.scaled(Vector3(1.2, 0.85, 1.2)), point))
			grass_colors.append(Color("6b8d50").lerp(Color("9ba761"), rng.randf()))
	var rock := SphereMesh.new()
	rock.radial_segments = 8
	rock.rings = 3
	rock.material = _nature.surface(Color.WHITE)
	_nature.batch_group(_root, "RealmTreeBoughs", _nature._bark_mesh(), trunks, trunk_colors, false)
	_nature.batch_group(_root, "RealmTreeCrowns", _nature._atlas_mesh(0), leaves, leaf_colors, true)
	_nature.batch_group(_root, "RealmWeatheredStones", rock, rocks, rock_colors, false)
	_nature.batch_group(
		_root, "RealmFernBanks", _nature._atlas_mesh(2, 2), grasses, grass_colors, true
	)
