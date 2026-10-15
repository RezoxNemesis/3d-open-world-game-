extends Node3D
## Authored origin sanctuary: a sheltered lotus basin and a reachable cliff pavilion.

const PALETTE := preload("res://scripts/architectural_palette.gd")
const NATURE := preload("res://scripts/nature.gd")
const BRIDGE := preload("res://assets/models/verdant/covered_bridge.glb")
const PAVILION := preload("res://assets/models/pavilion.glb")
const PERGOLA := preload("res://assets/models/verdant/pergola.glb")
const BURNER := preload("res://assets/models/celestial/incense_burner.glb")
const LANTERN := preload("res://assets/models/lantern.glb")
const RESIDENTS := preload("res://scripts/expedition_residents.gd")
const POND_CENTER := Vector3(-22, 0.08, -3)
const PAVILION_FLOOR := Vector3(-36, 8, -42)
const STAIR_START := Vector3(-39, 0, 1)
const STAIR_END := Vector3(-39, 8, -33)

var _world: Node3D
var _nature := NATURE.new()
var _stone: StandardMaterial3D
var _rock: StandardMaterial3D
var _cliff: ArrayMesh


func build(world: Node3D) -> void:
	name = "LotusCliffSanctuary"
	_world = world
	_stone = PALETTE.material_for("Stone").duplicate()
	_stone.albedo_color = Color("a7b3a1")
	_stone.uv1_triplanar = true
	_stone.uv1_world_triplanar = true
	_stone.uv1_scale = Vector3.ONE * 0.45
	_rock = StandardMaterial3D.new()
	_rock.albedo_texture = preload("res://assets/materials/landscape_karst_original.png")
	_rock.normal_enabled = true
	_rock.normal_texture = preload("res://assets/materials/landscape_karst_original_normal.png")
	_rock.normal_scale = 0.70
	_rock.albedo_color = Color("c0cbb8")
	_rock.roughness = 0.97
	_rock.uv1_triplanar = true
	_rock.uv1_world_triplanar = true
	_rock.uv1_scale = Vector3.ONE * 0.32
	_cliff = _cliff_mesh()
	_pond()
	_banks()
	_cliffs_and_falls()
	_crossing()
	_pavilion_route()
	_winding_path()
	preload("res://scripts/expedition_scenery.gd").new().build(self, world, _cliff)
	var residents := RESIDENTS.new()
	add_child(residents)
	residents.build()
	for item: GeometryInstance3D in find_children("*", "GeometryInstance3D", true, false):
		if not residents.is_ancestor_of(item) and not item.get_meta("unshadowed_scenery", false):
			item.set_meta("expedition_kind", "sanctuary")
	set_meta("route_start", STAIR_START)
	set_meta("route_end", STAIR_END)
	set_meta("pond_center", POND_CENTER)


func _mesh_item(label: String, mesh: Mesh, point: Vector3, solid: bool = false) -> MeshInstance3D:
	var item := MeshInstance3D.new()
	item.name = label
	item.mesh = mesh
	item.position = point
	add_child(item)
	if solid:
		item.create_trimesh_collision()
	return item


func _model(packed: PackedScene, point: Vector3, yaw: float = 0, size: float = 1) -> Node3D:
	var model: Node3D = packed.instantiate()
	model.position = point
	model.rotation.y = yaw
	model.scale = Vector3.ONE * size
	if packed not in [PAVILION, LANTERN]:
		PALETTE.apply(model)
	add_child(model)
	var body: StaticBody3D = _world._structure(
		self, "SanctuaryStructure", _world._scene_collision(packed), point, size
	)
	body.rotation.y = yaw
	return model


func _water_material(falling: bool = false) -> ShaderMaterial:
	var material := ShaderMaterial.new()
	material.shader = preload("res://assets/shaders/jade_water.gdshader")
	material.set_shader_parameter("water_color", Color("155c57"))
	material.set_shader_parameter("falling", falling)
	return material


func _pond_edge(angle: float) -> Vector3:
	var ripple := 1.0 + sin(angle * 3 + 0.7) * 0.055 + sin(angle * 7) * 0.025
	return Vector3(cos(angle) * 10 * ripple, 0, sin(angle) * 19 * ripple)


func _pond() -> void:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for index in range(96):
		var angle := index * TAU / 96
		for point in [Vector3.ZERO, _pond_edge(angle), _pond_edge(angle + TAU / 96)]:
			surface.set_normal(Vector3.UP)
			surface.set_uv(Vector2(point.x / 20 + 0.5, point.z / 38 + 0.5))
			surface.add_vertex(point)
	surface.set_material(_water_material())
	_mesh_item("LotusWater", surface.commit(), POND_CENTER)


func _banks() -> void:
	var rock := SphereMesh.new()
	rock.radial_segments = 12
	rock.rings = 5
	rock.radius = 1
	rock.height = 2
	rock.material = _rock
	var rng := RandomNumberGenerator.new()
	rng.seed = 99281
	var placements: Array[Transform3D] = []
	var colors: Array[Color] = []
	for index in range(57):
		var angle := index * TAU / 57
		var point := POND_CENTER + _pond_edge(angle)
		if absf(point.z + 3) < 2.3:
			continue
		point.y = rng.randf_range(0.05, 0.19)
		var size := Vector3(
			rng.randf_range(0.65, 1.2), rng.randf_range(0.25, 0.55), rng.randf_range(0.6, 1.15)
		)
		var basis := Basis.from_euler(Vector3(0.12, angle, rng.randf_range(-0.3, 0.3))).scaled(size)
		placements.append(Transform3D(basis, point))
		colors.append(Color.WHITE)
	_nature.batch_group(self, "IrregularMossBanks", rock, placements, colors, false)


func _cliff_mesh() -> ArrayMesh:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for tier in range(8):
		for side in range(48):
			var corners: Array[Vector3] = []
			for pair: Vector2i in [
				Vector2i(side, tier),
				Vector2i(side + 1, tier),
				Vector2i(side, tier + 1),
				Vector2i(side + 1, tier + 1)
			]:
				corners.append(_cliff_vertex(pair.x, pair.y))
			for index in [0, 1, 2, 1, 3, 2]:
				surface.set_uv(Vector2(corners[index].x, corners[index].y))
				surface.add_vertex(corners[index])
	for side in range(48):
		for point in [Vector3.UP, _cliff_vertex(side, 8), _cliff_vertex(side + 1, 8)]:
			surface.set_uv(Vector2(point.x, point.z))
			surface.add_vertex(point)
	surface.generate_normals()
	surface.set_material(_rock)
	return surface.commit()


func _cliff_vertex(side: int, tier: int) -> Vector3:
	var angle := side * TAU / 48
	var height := tier / 8.0
	var radius := (
		(1.0 - height * 0.28)
		* (1.0 + sin(angle * 5 + 0.6) * 0.045 + sin(angle * 11 + height * 2.7) * 0.025)
	)
	var ledge := 0.035 * sin(height * 34 + angle * 3) * (1.0 - height)
	return Vector3(cos(angle) * (radius + ledge), height, sin(angle) * (radius + ledge))


func _cliff_at(point: Vector3, size: Vector3) -> void:
	var item := _mesh_item("WeatheredCliff", _cliff, point, true)
	item.scale = size


func _cliffs_and_falls() -> void:
	# Broad, weathered shoulders shelter the basin; none is a stretched needle.
	_cliff_at(Vector3(-36, 0, -42), Vector3(10.5, 8, 11))
	_cliff_at(Vector3(-43, 0, -28), Vector3(6.5, 5, 8))
	_cliff_at(Vector3(-29, 0, -29), Vector3(6.2, 3.4, 6))
	_cliff_at(Vector3(-44, 0, -49), Vector3(6.5, 13, 7))
	# A high spill reaches an intermediate shelf, then feeds the lotus basin.
	_cascade(Vector3(-31.5, 8.02, -35.8), Vector3(-28.5, 3.45, -29.0), 2.25)
	_cascade(Vector3(-27.5, 3.42, -25.0), Vector3(-25.5, 0.11, -20.3), 2.6)
	var shelf_pool := PlaneMesh.new()
	shelf_pool.size = Vector2(3.9, 4.2)
	shelf_pool.material = _water_material()
	_mesh_item("CascadeShelfPool", shelf_pool, Vector3(-28.3, 3.43, -27.5))
	var impact := PlaneMesh.new()
	impact.size = Vector2(3.4, 2.5)
	var foam := ShaderMaterial.new()
	foam.shader = preload("res://assets/shaders/impact_foam.gdshader")
	impact.material = foam
	_mesh_item("WaterfallFoam", impact, Vector3(-25.5, 0.105, -19.9))
	var mist := QuadMesh.new()
	mist.size = Vector2(4.2, 2.2)
	var spray := ShaderMaterial.new()
	spray.shader = preload("res://assets/shaders/water_spray.gdshader")
	spray.set_shader_parameter("opacity", 0.14)
	mist.material = spray
	_mesh_item("CascadeMist", mist, Vector3(-25.5, 0.8, -20))


func _cascade(top: Vector3, bottom: Vector3, width: float) -> void:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for row in range(20):
		for column in range(8):
			for corner in [
				Vector2i(0, 0),
				Vector2i(1, 0),
				Vector2i(0, 1),
				Vector2i(1, 0),
				Vector2i(1, 1),
				Vector2i(0, 1)
			]:
				var u: float = (column + corner.x) / 8.0
				var v: float = (row + corner.y) / 20.0
				var point := bottom.lerp(top, v) + Vector3.RIGHT * ((u - 0.5) * width)
				point.z += sin(v * PI) * 0.3
				surface.set_uv(Vector2(u, v))
				surface.add_vertex(point)
	surface.generate_normals()
	surface.set_material(_water_material(true))
	_mesh_item("LivingCascade", surface.commit(), Vector3.ZERO)


func _solid_box(label: String, point: Vector3, size: Vector3, visible_mesh: bool = true) -> void:
	var shape := BoxShape3D.new()
	shape.size = size
	_world._structure(self, label, shape, point)
	if visible_mesh:
		var mesh := BoxMesh.new()
		mesh.size = size
		mesh.material = _stone
		_mesh_item(label + "Stone", mesh, point)


func _crossing() -> void:
	_model(BRIDGE, Vector3(-22, 0.36, -3), PI / 2)
	# Genuine short risers make the covered deck accessible from either dry bank.
	for side: int in [-1, 1]:
		for index in range(5):
			var height := minf(0.36, (index + 1) * 0.12)
			var x := -22 + side * (11.0 - index * 1.6)
			_solid_box("BridgeLanding", Vector3(x, height / 2, -3), Vector3(1.65, height, 2.5))
	_model(PERGOLA, Vector3(-10.8, 0, 20.5), PI / 2, 0.83)
	_model(LANTERN, Vector3(-10.8, 2.4, 20.5), 0, 0.8)


func _pavilion_route() -> void:
	var mesh := BoxMesh.new()
	mesh.material = _stone
	var placements: Array[Transform3D] = []
	var colors: Array[Color] = []
	for index in range(40):
		var height := (index + 1) * 0.2
		var point := Vector3(-39, height / 2, -index * 0.8 - 0.4)
		var size := Vector3(2.8, height, 0.81)
		placements.append(Transform3D(Basis.IDENTITY.scaled(size), point))
		colors.append(Color.WHITE)
		_solid_box("PavilionRiser", point, size, false)
	_nature.batch_group(self, "FortyStoneSteps", mesh, placements, colors, false)
	_solid_box("UpperLanding", Vector3(-39, 7.8, -33.6), Vector3(3, 0.4, 3.4))
	_solid_box("PavilionTerrace", Vector3(-36, 7.85, -40.5), Vector3(12.4, 0.3, 11.4))
	_model(PAVILION, PAVILION_FLOOR - Vector3.UP * 0.59 * 0.85, 0, 0.85)
	_model(BURNER, Vector3(-36, 8, -41.2), 0, 0.7)
	_stair_rails()


func _stair_rails() -> void:
	var placements: Array[Transform3D] = []
	var colors: Array[Color] = []
	for side in [-1, 1]:
		for index in range(11):
			var step := mini(index * 4, 39)
			var point := Vector3(-39 + side * 1.45, (step + 1) * 0.2, -step * 0.8 - 0.4)
			placements.append(_nature.branch_transform(point, point + Vector3.UP * 1.1, 0.065))
			colors.append(Color("664b38"))
			if index < 10:
				var end := point + Vector3(0, 0.8, -3.2)
				placements.append(
					_nature.branch_transform(point + Vector3.UP, end + Vector3.UP, 0.05)
				)
				colors.append(Color("664b38"))
	_nature.batch_group(self, "StairTimberRails", _nature._bark_mesh(), placements, colors, false)


func _winding_path() -> void:
	var waypoints: Array[Vector3] = [
		Vector3(-6, 0, 12),
		Vector3(-11, 0, 20),
		Vector3(-23, 0, 20),
		Vector3(-34, 0, 15),
		Vector3(-39, 0, 2)
	]
	var stone := CylinderMesh.new()
	stone.top_radius = 1
	stone.bottom_radius = 1
	stone.height = 1
	stone.radial_segments = 7
	stone.rings = 0
	stone.material = _stone
	var placements: Array[Transform3D] = []
	var colors: Array[Color] = []
	for index in range(waypoints.size() - 1):
		var start := waypoints[index]
		var finish := waypoints[index + 1]
		var count := ceili(start.distance_to(finish) / 1.5)
		for step in range(count):
			var point := start.lerp(finish, float(step) / count) + Vector3.UP * 0.025
			var basis := Basis.from_euler(Vector3(0, step * 0.71, 0)).scaled(
				Vector3(1.25, 0.05, 1.05)
			)
			placements.append(Transform3D(basis, point))
			colors.append(Color.WHITE)
	_nature.batch_group(self, "WindingPilgrimStones", stone, placements, colors, false)
