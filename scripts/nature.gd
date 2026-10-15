extends RefCounted
## Original botanical cards and forked woody stems share seeded spatial batches.

const AUTHORED_RESERVATIONS := [
	Rect2(-32.5, -37, 5, 39),  # Western shrine route.
	Rect2(-41, -50, 18, 16),  # Shrine terrace.
	Rect2(12.5, 24.5, 15, 13),  # Residence footprint.
	Rect2(18.2, 12, 3.6, 12),  # Courtyard exit approach.
	Rect2(9.7, 21.5, 3.6, 17.5),  # Residence side path.
	Rect2(11.5, 37.2, 8.5, 3.6),  # Path along the front garden.
	Rect2(18.2, 37, 3.6, 3)
]

var rng := RandomNumberGenerator.new()
var height_at: Callable
var botanical_texture: Texture2D
var bark_texture: Texture2D


func surface(color: Color) -> StandardMaterial3D:
	var result := StandardMaterial3D.new()
	result.albedo_color = color
	result.roughness = 0.9
	result.vertex_color_use_as_albedo = true
	result.vertex_color_is_srgb = true
	return result


func foliage_surface(
	blossom: bool = false, strength: float = 0.045, atlas: bool = false
) -> ShaderMaterial:
	var result := ShaderMaterial.new()
	result.shader = preload("res://assets/shaders/garden_foliage.gdshader")
	result.set_shader_parameter("blossom", blossom)
	result.set_shader_parameter("wind_strength", strength)
	result.set_shader_parameter("use_atlas", atlas)
	if atlas:
		if botanical_texture == null:
			botanical_texture = load("res://assets/materials/botanical_atlas.png")
		result.set_shader_parameter("foliage_atlas", botanical_texture)
	return result


func batch(
	parent: Node3D,
	label: String,
	mesh: Mesh,
	transforms: Array[Transform3D],
	colors: Array[Color],
	density_scaled: bool = false
) -> void:
	var groups: Dictionary = {}
	for i in range(transforms.size()):
		var point := transforms[i].origin
		var key := Vector2i(floori(point.x / 48), floori(point.z / 48))
		if not groups.has(key):
			groups[key] = []
		groups[key].append(i)
	for key in groups:
		var local_transforms: Array[Transform3D] = []
		var local_colors: Array[Color] = []
		for index in groups[key]:
			local_transforms.append(transforms[index])
			local_colors.append(colors[index])
		batch_group(parent, label, mesh, local_transforms, local_colors, density_scaled)


func batch_group(
	parent: Node3D,
	label: String,
	mesh: Mesh,
	transforms: Array[Transform3D],
	colors: Array[Color],
	density_scaled: bool
) -> void:
	var item := MultiMeshInstance3D.new()
	item.name = label
	var multi := MultiMesh.new()
	multi.transform_format = MultiMesh.TRANSFORM_3D
	multi.use_colors = true
	multi.mesh = mesh
	multi.instance_count = transforms.size()
	var instance_origins := PackedVector3Array()
	var order := range(transforms.size())
	if density_scaled:
		# A reduced prefix should thin all crowns, not strip the last trees of leaves.
		var shuffle_rng := RandomNumberGenerator.new()
		shuffle_rng.seed = hash(label + str(transforms[0].origin))
		for index in range(order.size() - 1, 0, -1):
			var other := shuffle_rng.randi_range(0, index)
			var previous: int = order[index]
			order[index] = order[other]
			order[other] = previous
	for i in range(transforms.size()):
		var source: int = order[i]
		instance_origins.append(transforms[source].origin)
		multi.set_instance_transform(i, transforms[source])
		multi.set_instance_color(i, colors[source])
	item.multimesh = multi
	var bounds := AABB()
	for index in range(transforms.size()):
		var instance_bounds: AABB = transforms[index] * mesh.get_aabb()
		bounds = instance_bounds if index == 0 else bounds.merge(instance_bounds)
	# Explicit bounds keep twisted branches and hanging vines from popping at edges.
	item.custom_aabb = bounds.grow(0.25)
	# Dummy rendering cannot read GPU transforms back; retain exact placement for route QA.
	item.set_meta("instance_origins", instance_origins)
	item.set_meta("density_scaled", density_scaled)
	item.set_meta(
		"near_cover",
		(
			label
			in [
				"MeadowGrass",
				"GardenFerns",
				"MeadowFlowers",
				"ForestUnderstory",
				"ForestLeafClumps",
				"MossCarpets",
				"FallenPetals",
				"PlantedEdgeLeaves",
				"PlantedEdgeFlowers"
			]
		)
	)
	item.visibility_range_end = 160
	if (
		label
		not in [
			"GardenBranches",
			"PineTrunks",
			"GardenStones",
			"FloweringCanopies",
			"PineCanopies",
			"AncientBoughs",
			"AncientLeaves"
		]
	):
		item.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(item)


func ground(point: Vector3) -> Vector3:
	point.y = float(height_at.call(point.x, point.z)) if height_at.is_valid() else -0.8
	if absf(point.x) < 21 and absf(point.z) < 21:
		point.y = 0.0
		if absf(absf(point.x) - 13) < 3.35 and absf(point.z - 7) < 3.9:
			point.y = 0.32
	return point


func transform_at(point: Vector3, scale_value: Vector3) -> Transform3D:
	var basis := Basis.from_euler(Vector3(rng.randf() * 0.6, rng.randf() * TAU, rng.randf() * 0.5))
	return Transform3D(
		Basis(basis.x * scale_value.x, basis.y * scale_value.y, basis.z * scale_value.z), point
	)


func branch_transform(start: Vector3, end: Vector3, radius: float) -> Transform3D:
	var direction := end - start
	var up := direction.normalized()
	var reference := Vector3.RIGHT if absf(up.dot(Vector3.FORWARD)) > 0.95 else Vector3.FORWARD
	var right := up.cross(reference).normalized()
	return Transform3D(
		Basis(right * radius, up * direction.length(), right.cross(up) * radius), (start + end) / 2
	)


func _bark_mesh() -> CylinderMesh:
	var result := CylinderMesh.new()
	result.top_radius = 0.82
	result.bottom_radius = 1.0
	result.height = 1.0
	result.radial_segments = 6
	result.rings = 1
	var material := surface(Color.WHITE)
	if bark_texture == null:
		bark_texture = load("res://assets/materials/botanical_bark.png")
	material.albedo_texture = bark_texture
	material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	result.material = material
	return result


func _atlas_mesh(tile: int, planes: int = 3) -> ArrayMesh:
	var builder := SurfaceTool.new()
	builder.begin(Mesh.PRIMITIVE_TRIANGLES)
	var offset := Vector2(tile % 2, tile / 2) * 0.5
	var uvs: Array[Vector2] = [Vector2(0, 1), Vector2(1, 1), Vector2(1, 0), Vector2(0, 0)]
	var points: Array[Vector3] = [
		Vector3(-0.5, -0.5, 0), Vector3(0.5, -0.5, 0), Vector3(0.5, 0.5, 0), Vector3(-0.5, 0.5, 0)
	]
	for plane in range(planes):
		var basis := Basis.from_euler(Vector3(plane * 0.23 - 0.2, plane * PI / planes, 0))
		for index in [0, 1, 2, 0, 2, 3]:
			builder.set_uv(offset + Vector2.ONE * 0.005 + uvs[index] * 0.49)
			builder.add_vertex(basis * points[index])
	builder.generate_normals()
	builder.set_material(foliage_surface(tile == 1, 0.055 if tile == 2 else 0.09, true))
	return builder.commit()


func petal_mesh() -> ArrayMesh:
	return _atlas_mesh(1, 2)


func grass_mesh() -> ArrayMesh:
	var builder := SurfaceTool.new()
	builder.begin(Mesh.PRIMITIVE_TRIANGLES)
	for blade in range(4):
		var angle := blade * 2.4
		var right := Vector3(cos(angle), 0, sin(angle)) * 0.035
		var base := Vector3(cos(angle) * 0.13, 0, sin(angle) * 0.13)
		var middle := base + Vector3(0.08, 0.26 + blade * 0.035, 0.04)
		var tip := middle + Vector3(0.12, 0.22, 0.05)
		var points: Array[Vector3] = [
			base - right, base + right, middle - right * 0.6, middle + right * 0.6, tip
		]
		for index in [0, 2, 1, 1, 2, 3, 2, 4, 3]:
			builder.add_vertex(points[index])
	builder.generate_normals()
	builder.set_material(foliage_surface(false, 0.14))
	return builder.commit()


func fern_mesh() -> ArrayMesh:
	var builder := SurfaceTool.new()
	builder.begin(Mesh.PRIMITIVE_TRIANGLES)
	for frond in range(6):
		var basis := Basis(Vector3.UP, frond * TAU / 6)
		for leaflet in range(6):
			var distance := 0.09 + leaflet * 0.105
			var width := (6 - leaflet) * 0.045
			var middle := Vector3(distance, 0.12 + sin(distance * 3.8) * 0.32, 0)
			for side in [-1, 1]:
				for point in [
					middle,
					middle + Vector3(0.10, 0.02, width * side),
					middle + Vector3(0.15, 0.0, 0.02 * side)
				]:
					builder.add_vertex(basis * point)
	builder.generate_normals()
	builder.set_material(foliage_surface(false, 0.06))
	return builder.commit()


func populate(parent: Node3D, seed_value: int, ground_height: Callable = Callable()) -> void:
	rng.seed = seed_value
	height_at = ground_height
	populate_blossoms(parent)
	populate_pines(parent)
	populate_stones(parent)
	populate_ground_cover(parent)
	preload("res://scripts/verdant_flora.gd").new().populate(self, parent, seed_value + 407)


func _add_branch(
	transforms: Array[Transform3D],
	colors: Array[Color],
	start: Vector3,
	end: Vector3,
	radius: float
) -> void:
	transforms.append(branch_transform(start, end, radius))
	colors.append(Color("c6b8a2").lerp(Color.WHITE, rng.randf() * 0.8))


func _camera_canopy(parent: Node3D, point: Vector3, width: float) -> void:
	var blocker := StaticBody3D.new()
	blocker.name = "CanopyCameraBlocker"
	blocker.collision_layer = 2
	blocker.collision_mask = 0
	blocker.position = point
	var collision := CollisionShape3D.new()
	var sphere := SphereShape3D.new()
	sphere.radius = width
	collision.shape = sphere
	blocker.add_child(collision)
	parent.add_child(blocker)


func populate_blossoms(parent: Node3D) -> void:
	var trunks: Array[Transform3D] = []
	var bark_colors: Array[Color] = []
	var flowers: Array[Transform3D] = []
	var blossom_colors: Array[Color] = []
	var leaves: Array[Transform3D] = []
	var leaf_colors: Array[Color] = []
	var maples: Array[Transform3D] = []
	var maple_colors: Array[Color] = []
	var tree_positions: Array[Vector3] = [
		Vector3(-10, 0, 9),
		Vector3(15, 0, 10),
		Vector3(-10.5, 0, -24),
		Vector3(12.5, 0, -24),
		Vector3(-49, 0, 11.5),
		Vector3(-49, 0, -16),
		Vector3(29, 0, 10),
		Vector3(35, 0, -18),
		Vector3(-16, 0, 16),
		Vector3(19, 0, -1),
		Vector3(-22, 0, -25),
		Vector3(22, 0, -25),
		Vector3(-24, 0, 22),
		Vector3(24, 0, 20),
		Vector3(34, 0, -28)
	]
	for tree_index in range(tree_positions.size()):
		var root_point := ground(tree_positions[tree_index])
		if not tree_clears_authored_routes(root_point, 6.4):
			continue
		var maple := tree_index >= 12
		var height := rng.randf_range(3.8, 5.7) * (0.85 if maple else 1.0)
		var lean := Vector3(rng.randf_range(-0.8, 0.8), 0, rng.randf_range(-0.65, 0.65))
		var bend := root_point + Vector3.UP * height * 0.32 + lean * 0.2
		var fork := root_point + Vector3.UP * height * 0.63 + lean
		_add_branch(trunks, bark_colors, root_point, bend, 0.27)
		_add_branch(trunks, bark_colors, bend, fork, 0.22)
		for branch in range(6):
			var angle := branch * 2.399 + rng.randf_range(-0.3, 0.3)
			var outward := Vector3(cos(angle), 0, sin(angle))
			var reach := rng.randf_range(1.7, 3.1)
			var joint := fork + outward * reach * 0.5 + Vector3.UP * height * 0.12
			var end := fork + outward * reach + Vector3.UP * rng.randf_range(0.55, 1.6)
			_add_branch(trunks, bark_colors, fork, joint, 0.13)
			_add_branch(trunks, bark_colors, joint, end, 0.085)
			_camera_canopy(parent, end + Vector3.UP * 0.2, 0.82)
			for twig in range(3):
				var twig_angle := angle + (twig - 1) * 0.7
				var twig_end := (
					end
					+ (
						Vector3(cos(twig_angle), 0.55 + twig * 0.1, sin(twig_angle))
						* rng.randf_range(0.45, 0.9)
					)
				)
				_add_branch(trunks, bark_colors, end, twig_end, 0.035)
				for cluster in range(6):
					var offset := Vector3(
						rng.randf_range(-0.68, 0.68),
						rng.randf_range(-0.12, 0.78),
						rng.randf_range(-0.68, 0.68)
					)
					var width := rng.randf_range(0.95, 1.45)
					var transform := transform_at(
						twig_end + offset, Vector3(width, width * 0.83, width)
					)
					if maple:
						maples.append(transform)
						maple_colors.append(Color("b4a27f").lerp(Color.WHITE, rng.randf()))
					else:
						flowers.append(transform)
						blossom_colors.append(Color("e0bdc8").lerp(Color.WHITE, rng.randf()))
				for cluster in range(2):
					leaves.append(
						transform_at(twig_end, Vector3(1.0, 0.65, 1.0) * rng.randf_range(0.7, 1.1))
					)
					leaf_colors.append(Color("7d8d6e").lerp(Color.WHITE, rng.randf() * 0.7))
	batch(parent, "GardenBranches", _bark_mesh(), trunks, bark_colors)
	batch(parent, "FloweringCanopies", petal_mesh(), flowers, blossom_colors, true)
	batch(parent, "GardenLeaves", _atlas_mesh(0), leaves, leaf_colors, true)
	batch(parent, "RedMapleCanopies", _atlas_mesh(3), maples, maple_colors, true)


func populate_pines(parent: Node3D) -> void:
	var roots: Array[Vector3] = []
	for i in range(82):
		var angle := rng.randf_range(-PI, PI)
		var radius := rng.randf_range(43, 102)
		var point := ground(Vector3(cos(angle) * radius, 0, sin(angle) * radius))
		if (point.z > 25 and absf(point.x) < 30) or route_or_water(point):
			continue
		roots.append(point)
	for point in [Vector3(-23, 0, -27), Vector3(25, 0, -24), Vector3(-22, 0, 20)]:
		roots.append(ground(point))
	_pine_group(parent, roots, 6.0, 11.5)


func populate_ledge(parent: Node3D, seed_value: int, points: Array[Vector3]) -> void:
	rng.seed = seed_value
	_pine_group(parent, points, 2.8, 5.2)


func _pine_group(parent: Node3D, roots: Array[Vector3], low: float, high: float) -> void:
	var leaves: Array[Transform3D] = []
	var colors: Array[Color] = []
	var trunks: Array[Transform3D] = []
	var trunk_colors: Array[Color] = []
	for root_point in roots:
		var height := rng.randf_range(low, high)
		# Authored ledge roots bypass ground scatter filtering. Reserve the complete
		# branching crown as well, so a nearby trunk cannot grow through a roof.
		if not tree_clears_authored_routes(root_point, height * 0.60 + 0.8):
			continue
		var lean := Vector3(rng.randf_range(-0.8, 0.8), 0, rng.randf_range(-0.8, 0.8))
		var previous := root_point
		var joints: Array[Vector3] = []
		for joint in range(4):
			var rise := float(joint + 1) / 4
			var point := root_point + Vector3.UP * height * rise + lean * sin(rise * PI * 0.65)
			_add_branch(trunks, trunk_colors, previous, point, height * (0.039 - rise * 0.022))
			joints.append(point)
			previous = point
		var yaw := rng.randf() * TAU
		for branch in range(9):
			var level := 0.35 + branch * 0.071
			var start := root_point + Vector3.UP * height * level + lean * sin(level * PI * 0.65)
			var angle := yaw + branch * 2.399
			var width := height * rng.randf_range(0.24, 0.38) * (1.15 - level * 0.7)
			var outward := Vector3(cos(angle), 0, sin(angle))
			var joint := start + outward * width * 0.6 + Vector3.UP * height * 0.025
			var end := start + outward * width + Vector3.UP * height * rng.randf_range(0.04, 0.09)
			_add_branch(trunks, trunk_colors, start, joint, height * 0.013)
			_add_branch(trunks, trunk_colors, joint, end, height * 0.007)
			for spray in range(5):
				var position := joint.lerp(end, rng.randf())
				position += (
					Vector3(
						rng.randf_range(-0.4, 0.4),
						rng.randf_range(0.0, 0.4),
						rng.randf_range(-0.4, 0.4)
					)
					* height
					/ 7.0
				)
				var size := height * rng.randf_range(0.14, 0.24)
				var basis := Basis.from_euler(
					Vector3(
						rng.randf_range(-0.7, 0.7),
						angle + rng.randf_range(-0.7, 0.7),
						rng.randf_range(-0.4, 0.4)
					)
				)
				leaves.append(
					Transform3D(basis.scaled(Vector3(size * 1.15, size * 0.85, size)), position)
				)
				colors.append(Color("839973").lerp(Color("d5ddac"), rng.randf() * 0.8))
		var tip_size := height * 0.2
		leaves.append(transform_at(joints[3], Vector3.ONE * tip_size))
		colors.append(Color("a7b38a"))
	batch(parent, "PineCanopies", _atlas_mesh(2), leaves, colors, true)
	batch(parent, "PineTrunks", _bark_mesh(), trunks, trunk_colors)


func tree_clears_authored_routes(point: Vector3, radius: float) -> bool:
	var origin := Vector2(point.x, point.z)
	for bounds in AUTHORED_RESERVATIONS:
		var nearest := Vector2(
			clampf(point.x, bounds.position.x, bounds.end.x),
			clampf(point.z, bounds.position.y, bounds.end.y)
		)
		if origin.distance_squared_to(nearest) <= radius * radius:
			return false
	return true


func route_or_water(point: Vector3) -> bool:
	if (
		not tree_clears_authored_routes(point, 0.0)
		or (absf(point.x) < 8 and point.z > -25 and point.z < 23)
	):
		return true
	var east_route := absf(point.z + 4) < 5 and point.x > 16 and point.x < 54
	var west_route := absf(point.z - 1) < 5 and point.x < -17 and point.x > -47
	var upper_stair := point.x > 47 and point.x < 53 and point.z > -33 and point.z < -4
	var upper_terrace := point.x > 37 and point.x < 55 and point.z > -50 and point.z < -28
	if east_route or west_route or upper_stair or upper_terrace:
		return true
	if point.x > -48 and point.x < -20 and point.z > -21 and point.z < 17:
		return true
	var reflecting_pool := point.x > 4.6 and point.x < 11.5 and point.z > -5 and point.z < 4
	if reflecting_pool:
		return true
	if absf(point.x) < 21 and absf(point.z) < 21:
		return not (absf(absf(point.x) - 13) < 3.2 and absf(point.z - 7) < 3.7)
	return false


func populate_ground_cover(parent: Node3D) -> void:
	var grass: Array[Transform3D] = []
	var grass_colors: Array[Color] = []
	var ferns: Array[Transform3D] = []
	var fern_colors: Array[Color] = []
	var flowers: Array[Transform3D] = []
	var flower_colors: Array[Color] = []
	for i in range(3800):
		var point := Vector3(rng.randf_range(-78, 78), 0, rng.randf_range(-88, 42))
		if i > 3300:
			point = Vector3(
				(13.0 if i % 2 == 0 else -13.0) + rng.randf_range(-2.8, 2.8),
				0,
				7 + rng.randf_range(-3.2, 3.2)
			)
		if route_or_water(point):
			continue
		point = ground(point)
		var patch := rng.randf_range(0.6, 1.4)
		grass.append(
			Transform3D(Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3.ONE * patch), point)
		)
		grass_colors.append(Color("48633d").lerp(Color("879257"), rng.randf() * 0.75))
		if i % 13 == 0:
			ferns.append(transform_at(point, Vector3.ONE * rng.randf_range(0.75, 1.5)))
			fern_colors.append(Color("315a42").lerp(Color("6b8652"), rng.randf() * 0.6))
		if i % 19 == 0:
			flowers.append(
				transform_at(point + Vector3.UP * 0.28, Vector3.ONE * rng.randf_range(0.4, 0.65))
			)
			flower_colors.append(Color("cfa9b1").lerp(Color.WHITE, rng.randf()))
	batch(parent, "MeadowGrass", grass_mesh(), grass, grass_colors, true)
	batch(parent, "GardenFerns", fern_mesh(), ferns, fern_colors, true)
	batch(parent, "MeadowFlowers", petal_mesh(), flowers, flower_colors, true)


func populate_stones(parent: Node3D) -> void:
	var transforms: Array[Transform3D] = []
	var colors: Array[Color] = []
	for i in range(110):
		var point := Vector3(rng.randf_range(-58, 58), 0, rng.randf_range(-48, 30))
		if route_or_water(point):
			continue
		point = ground(point) - Vector3.UP * 0.18
		var width := rng.randf_range(0.5, 1.8)
		transforms.append(transform_at(point, Vector3(width, width * 0.6, width)))
		colors.append(Color("73796a").lerp(Color("a3a48b"), rng.randf()))
	var mesh := SphereMesh.new()
	mesh.radius = 1.0
	mesh.height = 1.5
	mesh.radial_segments = 8
	mesh.rings = 4
	mesh.material = surface(Color.WHITE)
	batch(parent, "GardenStones", mesh, transforms, colors)
