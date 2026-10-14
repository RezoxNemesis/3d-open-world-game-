extends RefCounted
## Seeded garden plants share spatial batches; authored walking routes stay clear.

var rng := RandomNumberGenerator.new()
var height_at: Callable


func surface(color: Color) -> StandardMaterial3D:
	var result := StandardMaterial3D.new()
	result.albedo_color = color
	result.roughness = 0.9
	result.vertex_color_use_as_albedo = true
	result.vertex_color_is_srgb = true
	return result


func foliage_surface(blossom: bool = false, strength: float = 0.045) -> ShaderMaterial:
	var result := ShaderMaterial.new()
	result.shader = preload("res://assets/shaders/garden_foliage.gdshader")
	result.set_shader_parameter("blossom", blossom)
	result.set_shader_parameter("wind_strength", strength)
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
		var key := Vector2i(floori(point.x / 32), floori(point.z / 32))
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
	for i in range(transforms.size()):
		instance_origins.append(transforms[i].origin)
		multi.set_instance_transform(i, transforms[i])
		multi.set_instance_color(i, colors[i])
	item.multimesh = multi
	# Dummy rendering cannot read GPU transforms back; retain source origins for route QA.
	item.set_meta("instance_origins", instance_origins)
	item.set_meta("density_scaled", density_scaled)
	item.set_meta("near_cover", label in ["MeadowGrass", "GardenFerns", "MeadowFlowers"])
	item.visibility_range_end = 160
	if label not in ["GardenBranches", "PineTrunks", "GardenStones"]:
		item.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(item)


func ground(point: Vector3) -> Vector3:
	point.y = float(height_at.call(point.x, point.z)) if height_at.is_valid() else -0.8
	# Flower beds sit above the courtyard, all other plants follow real terrain.
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
	var right := up.cross(Vector3.FORWARD).normalized()
	return Transform3D(
		Basis(right * radius, up * direction.length(), right.cross(up) * radius), (start + end) / 2
	)


func canopy_mesh() -> SphereMesh:
	var result := SphereMesh.new()
	result.radius = 1.0
	result.height = 2.0
	result.radial_segments = 10
	result.rings = 4
	result.material = foliage_surface()
	return result


func petal_mesh() -> ArrayMesh:
	var builder := SurfaceTool.new()
	builder.begin(Mesh.PRIMITIVE_TRIANGLES)
	for axis in range(3):
		var basis := Basis(Vector3.UP, axis * TAU / 3)
		var points: Array[Vector3] = [
			Vector3(-0.08, 0, 0),
			Vector3(0.16, 0.09, -0.15),
			Vector3(0.55, 0.03, 0),
			Vector3(0.16, 0.09, 0.15)
		]
		for index in [0, 1, 2, 0, 2, 3]:
			builder.add_vertex(basis * points[index])
	builder.generate_normals()
	builder.set_material(foliage_surface(true, 0.07))
	return builder.commit()


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
	for frond in range(5):
		var basis := Basis(Vector3.UP, frond * TAU / 5)
		for leaflet in range(4):
			var distance := 0.10 + leaflet * 0.16
			var width := (4 - leaflet) * 0.06
			var middle := Vector3(distance, 0.20 + sin(distance * 3.0) * 0.22, 0)
			for side in [-1, 1]:
				for point in [
					middle,
					middle + Vector3(0.12, 0.02, width * side),
					middle + Vector3(0.18, 0.0, 0.02 * side)
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


func populate_blossoms(parent: Node3D) -> void:
	var trunks: Array[Transform3D] = []
	var bark_colors: Array[Color] = []
	var flowers: Array[Transform3D] = []
	var blossom_colors: Array[Color] = []
	var cores: Array[Transform3D] = []
	var core_colors: Array[Color] = []
	var leaves: Array[Transform3D] = []
	var leaf_colors: Array[Color] = []
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
		Vector3(22, 0, -25)
	]
	for root_point in tree_positions:
		root_point = ground(root_point)
		var height := rng.randf_range(3.3, 5.0)
		var fork := root_point + Vector3(rng.randf_range(-0.25, 0.25), height * 0.6, 0.2)
		trunks.append(branch_transform(root_point, fork, 0.27))
		bark_colors.append(Color("56453b"))
		for branch in range(7):
			var angle := branch * TAU / 7 + rng.randf() * 0.5
			var reach := rng.randf_range(1.3, 2.6)
			var end := (
				root_point
				+ Vector3(
					cos(angle) * reach, height + rng.randf_range(-0.2, 0.8), sin(angle) * reach
				)
			)
			trunks.append(branch_transform(fork, end, rng.randf_range(0.08, 0.15)))
			bark_colors.append(Color("74604f"))
			var width := rng.randf_range(1.0, 1.45)
			var canopy_blocker := StaticBody3D.new()
			canopy_blocker.name = "CanopyCameraBlocker"
			canopy_blocker.collision_layer = 2
			canopy_blocker.collision_mask = 0
			canopy_blocker.position = end
			var canopy_shape := CollisionShape3D.new()
			var canopy_sphere := SphereShape3D.new()
			canopy_sphere.radius = width * 0.86
			canopy_shape.shape = canopy_sphere
			canopy_blocker.add_child(canopy_shape)
			parent.add_child(canopy_blocker)
			for lobe in range(3):
				var lobe_width := width * rng.randf_range(0.45, 0.67)
				var offset := Vector3(
					rng.randf_range(-0.55, 0.55),
					rng.randf_range(-0.25, 0.40),
					rng.randf_range(-0.55, 0.55)
				)
				cores.append(
					transform_at(
						end + offset,
						Vector3(lobe_width, lobe_width * rng.randf_range(0.65, 0.95), lobe_width)
					)
				)
				core_colors.append(Color("bd798b").lerp(Color("e6b9ae"), rng.randf() * 0.85))
			var leaf_offset := Vector3(
				rng.randf_range(-0.35, 0.35), -0.2, rng.randf_range(-0.35, 0.35)
			)
			leaves.append(
				transform_at(end + leaf_offset, Vector3(width * 0.60, 0.48, width * 0.65))
			)
			leaf_colors.append(Color("375840").lerp(Color("628453"), rng.randf() * 0.7))
			for blossom_index in range(62):
				var angle_detail := rng.randf() * TAU
				var elevation := rng.randf_range(-0.75, 0.9)
				var ring_width := sqrt(1.0 - elevation * elevation)
				var offset := (
					Vector3(
						cos(angle_detail) * ring_width,
						elevation * 0.7,
						sin(angle_detail) * ring_width
					)
					* width
				)
				flowers.append(
					transform_at(end + offset, Vector3.ONE * rng.randf_range(0.30, 0.48))
				)
				blossom_colors.append(Color("df95a6").lerp(Color("ffe0cc"), rng.randf()))
	var trunk := CylinderMesh.new()
	trunk.top_radius = 0.55
	trunk.bottom_radius = 1.0
	trunk.height = 1.0
	trunk.radial_segments = 8
	trunk.rings = 1
	trunk.material = surface(Color.WHITE)
	batch(parent, "GardenBranches", trunk, trunks, bark_colors)
	var blossom_core := canopy_mesh()
	blossom_core.radial_segments = 8
	blossom_core.rings = 3
	blossom_core.material = foliage_surface(true, 0.025)
	batch(parent, "BlossomCrowns", blossom_core, cores, core_colors)
	batch(parent, "FloweringCanopies", petal_mesh(), flowers, blossom_colors, true)
	batch(parent, "GardenLeaves", canopy_mesh(), leaves, leaf_colors)


func populate_pines(parent: Node3D) -> void:
	var transforms: Array[Transform3D] = []
	var colors: Array[Color] = []
	var trunk_transforms: Array[Transform3D] = []
	var trunk_colors: Array[Color] = []
	for i in range(82):
		var angle := rng.randf_range(-PI, PI)
		var radius := rng.randf_range(43, 102)
		var point := ground(Vector3(cos(angle) * radius, 0, sin(angle) * radius))
		if point.z > 25 and absf(point.x) < 30:
			continue
		var height := rng.randf_range(6, 12)
		trunk_transforms.append(
			Transform3D(
				Basis.IDENTITY.scaled(Vector3(0.23, height, 0.23)), point + Vector3.UP * height / 2
			)
		)
		trunk_colors.append(Color("564d39"))
		for layer in range(4):
			var width := (4 - layer) * height * 0.08
			for lobe in range(3):
				var yaw := lobe * TAU / 3 + layer * 1.3
				var center := (
					point
					+ Vector3(
						cos(yaw) * width * 0.35,
						height * 0.43 + layer * height * 0.14,
						sin(yaw) * width * 0.35
					)
				)
				transforms.append(
					Transform3D(
						(
							Basis(Vector3.UP, yaw)
							* Basis.from_scale(Vector3(width, height * 0.11, width * 0.58))
						),
						center
					)
				)
				colors.append(Color("254c40").lerp(Color("59734d"), rng.randf() * 0.8))
	var pine := canopy_mesh()
	pine.radial_segments = 8
	pine.rings = 2
	batch(parent, "PineCanopies", pine, transforms, colors)
	var trunk := CylinderMesh.new()
	trunk.top_radius = 0.45
	trunk.bottom_radius = 0.8
	trunk.height = 1.0
	trunk.radial_segments = 6
	trunk.rings = 1
	trunk.material = surface(Color.WHITE)
	batch(parent, "PineTrunks", trunk, trunk_transforms, trunk_colors)


func route_or_water(point: Vector3) -> bool:
	if absf(point.x) < 8 and point.z > -25 and point.z < 23:
		return true
	var east_route := absf(point.z + 4) < 5 and point.x > 16 and point.x < 48
	var west_route := absf(point.z - 1) < 5 and point.x < -17 and point.x > -47
	if east_route or west_route:
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
	for i in range(4100):
		var point := Vector3(rng.randf_range(-78, 78), 0, rng.randf_range(-88, 42))
		if route_or_water(point):
			continue
		point = ground(point)
		var patch := rng.randf_range(0.55, 1.25)
		grass.append(
			Transform3D(Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3.ONE * patch), point)
		)
		grass_colors.append(Color("48633d").lerp(Color("879257"), rng.randf() * 0.75))
		if i % 12 == 0:
			ferns.append(transform_at(point, Vector3.ONE * rng.randf_range(0.75, 1.5)))
			fern_colors.append(Color("315a42").lerp(Color("6b8652"), rng.randf() * 0.6))
		if i % 17 == 0:
			flowers.append(
				transform_at(point + Vector3.UP * 0.28, Vector3.ONE * rng.randf_range(0.40, 0.65))
			)
			flower_colors.append(Color("e9b9be").lerp(Color("e9d39a"), rng.randf()))
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
