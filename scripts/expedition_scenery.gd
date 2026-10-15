extends RefCounted
## Origin-only karst garden framing, with physical rock silhouettes and bounded ground cover.

const NATURE := preload("res://scripts/nature.gd")


func build(sanctuary: Node3D, world: Node3D, cliff: ArrayMesh) -> void:
	var root := Node3D.new()
	root.name = "JadeKarstGarden"
	sanctuary.add_child(root)
	var nature := NATURE.new()
	nature.rng.seed = 78213
	var transforms: Array[Transform3D] = []
	var colors: Array[Color] = []
	var crowns: Array[Vector3] = []
	var collision := cliff.create_trimesh_shape()
	for entry in [
		[Vector3(49, -2, -18), Vector3(7, 22, 9)],
		[Vector3(55, -3, -38), Vector3(7, 36, 8)],
		[Vector3(43, -2, -53), Vector3(8, 25, 8)],
		[Vector3(56, -2, 3), Vector3(6, 14, 6)]
	]:
		var point: Vector3 = entry[0]
		var size: Vector3 = entry[1]
		transforms.append(Transform3D(Basis.IDENTITY.scaled(size), point))
		colors.append(Color.WHITE)
		var body: StaticBody3D = world._structure(root, "SolidKarst", collision, point)
		body.scale = size
		crowns.append(point + Vector3.UP * size.y)
	nature.batch_group(root, "JadeKarstSilhouettes", cliff, transforms, colors, false)
	nature.populate_ledge(root, 78213, crowns)
	_cover(root, nature, world)
	for item: GeometryInstance3D in root.find_children("*", "GeometryInstance3D", true, false):
		item.set_meta("unshadowed_scenery", true)
		item.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func _cover(root: Node3D, nature: RefCounted, world: Node3D) -> void:
	var grasses: Array[Transform3D] = []
	var grass_colors: Array[Color] = []
	var flowers: Array[Transform3D] = []
	var flower_colors: Array[Color] = []
	for index in range(1900):
		var point := Vector3(nature.rng.randf_range(5, 39), 0, nature.rng.randf_range(-14, 35))
		if not cover_allowed(point):
			continue
		var patch := sin(point.x * 0.36) + cos(point.z * 0.41) + sin(point.x * 0.2 + point.z * 0.3)
		if patch < -0.55:
			continue
		point.y = world.ground_height(Vector2i.ZERO, point) + 0.025
		var size: float = nature.rng.randf_range(0.55, 1.25)
		var at := Transform3D(
			Basis(Vector3.UP, nature.rng.randf() * TAU).scaled(Vector3.ONE * size), point
		)
		grasses.append(at)
		grass_colors.append(Color("506b3c").lerp(Color("b0b66e"), nature.rng.randf() * 0.65))
		if index % 8 == 0:
			at.origin.y += 0.25
			at.basis = at.basis.scaled(Vector3.ONE * 0.4)
			flowers.append(at)
			flower_colors.append(Color("dbc5ab").lerp(Color("b99bc6"), nature.rng.randf()))
	nature.batch_group(root, "PilgrimMeadow", nature.grass_mesh(), grasses, grass_colors, true)
	nature.batch_group(root, "MeadowFlowers", nature.petal_mesh(), flowers, flower_colors, true)


func cover_allowed(point: Vector3) -> bool:
	return (
		absf(point.z - 12) > 4.5
		and Vector2(point.x - 18, point.z - 6).length() > 8.2
		and Vector2(point.x - 8, point.z - 12).length() > 5.5
		and not (point.x < 16 and point.z < 0)
	)
