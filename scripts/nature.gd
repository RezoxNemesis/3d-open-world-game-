extends RefCounted
## Deterministic foliage is instanced in a few draw calls and never blocks routes.

var rng := RandomNumberGenerator.new()


func surface(color: Color) -> StandardMaterial3D:
	var result := StandardMaterial3D.new()
	result.albedo_color = color
	result.roughness = 0.9
	result.vertex_color_use_as_albedo = true
	result.vertex_color_is_srgb = true
	return result


func batch(
	parent: Node3D, label: String, mesh: Mesh, transforms: Array[Transform3D], colors: Array[Color]
) -> void:
	# Spatial groups keep one off-screen tree from submitting an entire forest.
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
		batch_group(parent, label, mesh, local_transforms, local_colors)


func batch_group(
	parent: Node3D, label: String, mesh: Mesh, transforms: Array[Transform3D], colors: Array[Color]
) -> void:
	var item := MultiMeshInstance3D.new()
	item.name = label
	var multi := MultiMesh.new()
	multi.transform_format = MultiMesh.TRANSFORM_3D
	multi.use_colors = true
	multi.mesh = mesh
	multi.instance_count = transforms.size()
	for i in range(transforms.size()):
		multi.set_instance_transform(i, transforms[i])
		multi.set_instance_color(i, colors[i])
	item.multimesh = multi
	item.visibility_range_end = 230
	if label == "FloweringCanopies":
		item.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(item)


func transform_at(point: Vector3, scale_value: Vector3) -> Transform3D:
	var basis := Basis.from_euler(Vector3(rng.randf() * 0.6, rng.randf() * TAU, rng.randf() * 0.5))
	return Transform3D(basis.scaled(scale_value), point)


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
	var material := surface(Color.WHITE)
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	builder.set_material(material)
	return builder.commit()


func pine_mesh() -> ArrayMesh:
	var builder := SurfaceTool.new()
	builder.begin(Mesh.PRIMITIVE_TRIANGLES)
	for sector in range(16):
		var a := sector * TAU / 16
		var b := (sector + 1) * TAU / 16
		var ra := 1.0 if sector % 2 == 0 else 0.55
		var rb := 1.0 if sector % 2 == 1 else 0.55
		var left := Vector3(cos(a) * ra, -0.18, sin(a) * ra)
		var right := Vector3(cos(b) * rb, -0.18, sin(b) * rb)
		for point in [Vector3(0, 0.38, 0), right, left]:
			builder.add_vertex(point)
	builder.generate_normals()
	var material := surface(Color.WHITE)
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	builder.set_material(material)
	return builder.commit()


func populate(parent: Node3D, seed_value: int) -> void:
	rng.seed = seed_value
	var trunks: Array[Transform3D] = []
	var bark_colors: Array[Color] = []
	var flowers: Array[Transform3D] = []
	var blossom_colors: Array[Color] = []
	var foliage: Array[Transform3D] = []
	var leaf_colors: Array[Color] = []
	var tree_positions: Array[Vector3] = [
		Vector3(-10, 0, 9),
		Vector3(15, 0, 10),
		Vector3(-13, 0, -12),
		Vector3(14, 0, -14),
		Vector3(-39, 0, 12),
		Vector3(-41, 0, -14),
		Vector3(29, 0, 10),
		Vector3(35, 0, -18),
		Vector3(-16, 0, 16),
		Vector3(19, 0, -1),
		Vector3(-22, 0, -25),
		Vector3(22, 0, -25)
	]
	for root_point in tree_positions:
		var height := rng.randf_range(3.3, 5.5)
		trunks.append(
			Transform3D(
				Basis.IDENTITY.scaled(Vector3(0.3, height, 0.3)),
				root_point + Vector3(0, height / 2, 0)
			)
		)
		bark_colors.append(Color("665046"))
		for branch in range(5):
			var angle := branch * TAU / 5 + rng.randf() * 0.4
			var end := (
				root_point
				+ Vector3(cos(angle) * 2.1, height + rng.randf_range(-0.3, 1.2), sin(angle) * 2.1)
			)
			var start := root_point + Vector3(0, height * 0.55, 0)
			var direction := end - start
			var basis := Basis.IDENTITY
			basis.y = direction.normalized()
			basis.x = basis.y.cross(Vector3.FORWARD).normalized()
			basis.z = basis.x.cross(basis.y).normalized()
			trunks.append(
				Transform3D(
					basis.scaled(Vector3(0.15, direction.length(), 0.15)), (start + end) / 2
				)
			)
			bark_colors.append(Color("78604f"))
			for leaf_index in range(180):
				var offset := Vector3(rng.randfn(0, 0.85), rng.randfn(0, 0.55), rng.randfn(0, 0.85))
				var point := end + offset
				flowers.append(transform_at(point, Vector3.ONE * rng.randf_range(0.32, 0.56)))
				blossom_colors.append(Color("cc788b").lerp(Color("f3c8bb"), rng.randf() * 0.7))
			for leaf_index in range(80):
				var point := (
					end + Vector3(rng.randfn(0, 0.9), rng.randfn(-0.4, 0.5), rng.randfn(0, 0.9))
				)
				foliage.append(transform_at(point, Vector3.ONE * rng.randf_range(0.28, 0.5)))
				leaf_colors.append(Color("4b7055").lerp(Color("7f985d"), rng.randf()))
	var trunk := CylinderMesh.new()
	trunk.top_radius = 0.55
	trunk.bottom_radius = 1.0
	trunk.height = 1.0
	trunk.radial_segments = 7
	trunk.rings = 1
	trunk.material = surface(Color.WHITE)
	batch(parent, "GardenBranches", trunk, trunks, bark_colors)
	var blossom := petal_mesh()
	batch(parent, "FloweringCanopies", blossom, flowers, blossom_colors)
	var leaf_mesh := petal_mesh()
	batch(parent, "GardenLeaves", leaf_mesh, foliage, leaf_colors)
	populate_pines(parent)
	populate_stones(parent)


func populate_pines(parent: Node3D) -> void:
	var transforms: Array[Transform3D] = []
	var colors: Array[Color] = []
	var trunk_transforms: Array[Transform3D] = []
	var trunk_colors: Array[Color] = []
	for i in range(110):
		var angle := rng.randf_range(-PI, PI)
		var radius := rng.randf_range(43, 105)
		var point := Vector3(cos(angle) * radius, -0.6, sin(angle) * radius)
		if point.z > 25 and absf(point.x) < 30:
			continue
		var height := rng.randf_range(6, 13)
		trunk_transforms.append(
			Transform3D(
				Basis.IDENTITY.scaled(Vector3(0.30, height, 0.30)),
				point + Vector3(0, height / 2, 0)
			)
		)
		trunk_colors.append(Color("564d39"))
		for layer in range(5):
			var width := (5 - layer) * height * 0.08
			transforms.append(
				Transform3D(
					Basis(Vector3.UP, rng.randf() * TAU).scaled(
						Vector3(width, height * 0.32, width)
					),
					point + Vector3(0, height * 0.42 + layer * height * 0.12, 0)
				)
			)
			colors.append(Color("243f37").lerp(Color("55764b"), rng.randf()))
	var cone := pine_mesh()
	batch(parent, "PineCanopies", cone, transforms, colors)
	var trunk := CylinderMesh.new()
	trunk.top_radius = 0.45
	trunk.bottom_radius = 0.8
	trunk.height = 1.0
	trunk.radial_segments = 6
	trunk.rings = 1
	trunk.material = surface(Color.WHITE)
	batch(parent, "PineTrunks", trunk, trunk_transforms, trunk_colors)


func populate_stones(parent: Node3D) -> void:
	var transforms: Array[Transform3D] = []
	var colors: Array[Color] = []
	for i in range(110):
		var point := Vector3(rng.randf_range(-50, 50), -0.5, rng.randf_range(-40, 30))
		if absf(point.x) < 8 or absf(point.z + 4) < 3.5:
			continue
		var width := rng.randf_range(0.5, 2.2)
		transforms.append(transform_at(point, Vector3(width, width * 0.7, width)))
		colors.append(Color("7a8272").lerp(Color("adb0a0"), rng.randf()))
	var mesh := SphereMesh.new()
	mesh.radius = 1.0
	mesh.height = 1.5
	mesh.radial_segments = 7
	mesh.rings = 3
	mesh.material = surface(Color.WHITE)
	batch(parent, "GardenStones", mesh, transforms, colors)
