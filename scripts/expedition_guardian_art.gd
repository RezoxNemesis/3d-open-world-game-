extends RefCounted
## Original procedural stone-and-cedar qilin and wind cart, batched by mesh/material.

var batches: Dictionary = {}
var materials: Array[StandardMaterial3D] = []
var meshes: Array[Mesh] = []


func _init() -> void:
	for color in [
		Color("617c72"),
		Color("cfad62"),
		Color("303d37"),
		Color("794c34"),
		Color("8de6cb"),
		Color("e5d6ad")
	]:
		var material := StandardMaterial3D.new()
		material.albedo_color = color
		material.roughness = 0.8
		if color == Color("8de6cb"):
			material.emission_enabled = true
			material.emission = color
			material.emission_energy_multiplier = 1.3
		materials.append(material)
	var sphere := SphereMesh.new()
	sphere.radius = 0.5
	sphere.height = 1.0
	sphere.radial_segments = 10
	sphere.rings = 6
	var cube := BoxMesh.new()
	var cylinder := CylinderMesh.new()
	cylinder.top_radius = 0.5
	cylinder.bottom_radius = 0.5
	cylinder.height = 1.0
	cylinder.radial_segments = 10
	var cone := CylinderMesh.new()
	cone.top_radius = 0.0
	cone.bottom_radius = 0.5
	cone.height = 1.0
	cone.radial_segments = 8
	meshes.assign([sphere, cube, cylinder, cone])


func part(
	kind: int, material: int, position: Vector3, size: Vector3, rotation := Vector3.ZERO
) -> void:
	var key := Vector2i(kind, material)
	if not batches.has(key):
		batches[key] = []
	batches[key].append(Transform3D(Basis.from_euler(rotation).scaled_local(size), position))


func rod(material: int, start: Vector3, end: Vector3, width: float) -> void:
	var direction := end - start
	var basis := Basis(Quaternion(Vector3.UP, direction.normalized()))
	var key := Vector2i(2, material)
	if not batches.has(key):
		batches[key] = []
	batches[key].append(
		Transform3D(
			basis.scaled_local(Vector3(width, direction.length(), width)), (start + end) * 0.5
		)
	)


func finish(parent: Node3D) -> void:
	for key: Vector2i in batches:
		var multimesh := MultiMesh.new()
		multimesh.transform_format = MultiMesh.TRANSFORM_3D
		multimesh.mesh = meshes[key.x]
		multimesh.instance_count = batches[key].size()
		for index in range(multimesh.instance_count):
			multimesh.set_instance_transform(index, batches[key][index])
		var instance := MultiMeshInstance3D.new()
		instance.multimesh = multimesh
		instance.material_override = materials[key.y]
		parent.add_child(instance)
	batches.clear()


func guardian(parent: Node3D) -> void:
	# A broad four-legged silhouette, layered cedar ribs and jade armor.
	part(0, 2, Vector3(0, 2.0, 0), Vector3(2.5, 2.1, 3.8))
	part(0, 0, Vector3(0, 2.5, 0.5), Vector3(2.35, 1.8, 2.5))
	for side in [-1.0, 1.0]:
		for z in [-1.1, 1.1]:
			part(
				0,
				0,
				Vector3(side * 0.94, 1.2, z),
				Vector3(0.85, 2.0, 1.1),
				Vector3(0.18 * z, 0, side * -0.15)
			)
			part(1, 3, Vector3(side * 0.97, 0.3, z + 0.18), Vector3(0.75, 0.45, 1.0))
			for claw in range(3):
				part(
					3,
					1,
					Vector3(side * 0.97 + (claw - 1) * 0.21, 0.24, z + 0.76),
					Vector3(0.15, 0.42, 0.15),
					Vector3(PI / 2, 0, 0)
				)
		for rib in range(6):
			part(
				1,
				3,
				Vector3(side * 1.15, 2.0, -1.5 + rib * 0.5),
				Vector3(0.16, 1.55, 0.24),
				Vector3(0.05, 0, side * -0.25)
			)
			part(0, 1, Vector3(side * 1.18, 2.72, -1.5 + rib * 0.5), Vector3(0.34, 0.22, 0.4))
	# Shoulder mane and forward elongated dragon muzzle; guardian faces +Z.
	part(0, 0, Vector3(0, 3.0, 1.3), Vector3(2.0, 2.25, 1.6))
	part(0, 0, Vector3(0, 3.65, 1.9), Vector3(1.75, 1.4, 1.65))
	part(1, 3, Vector3(0, 3.38, 2.75), Vector3(1.26, 0.6, 1.25))
	part(1, 1, Vector3(0, 3.2, 2.96), Vector3(1.25, 0.14, 1.1))
	part(0, 2, Vector3(0, 3.65, 3.24), Vector3(0.95, 0.34, 0.36))
	for side in [-1.0, 1.0]:
		part(0, 4, Vector3(side * 0.7, 3.87, 2.44), Vector3(0.25, 0.22, 0.32))
		part(
			1,
			1,
			Vector3(side * 0.64, 4.05, 2.34),
			Vector3(0.58, 0.12, 0.25),
			Vector3(0, 0, side * -0.2)
		)
		rod(1, Vector3(side * 0.58, 4.12, 1.75), Vector3(side * 0.88, 5.35, 1.3), 0.19)
		rod(1, Vector3(side * 0.88, 5.35, 1.3), Vector3(side * 1.5, 5.75, 1.5), 0.13)
		rod(1, Vector3(side * 0.81, 4.97, 1.45), Vector3(side * 1.48, 5.3, 1.05), 0.13)
		rod(1, Vector3(side * 0.65, 3.45, 3.1), Vector3(side * 1.8, 3.2, 3.25), 0.055)
		rod(1, Vector3(side * 1.8, 3.2, 3.25), Vector3(side * 2.25, 3.6, 2.85), 0.04)
		for strand in range(5):
			part(
				3,
				3,
				Vector3(side * (0.7 + strand * 0.12), 3.1 - strand * 0.2, 1.3 - strand * 0.15),
				Vector3(0.5, 1.5, 0.5),
				Vector3(0.5, 0, side * 0.6)
			)
	for plate in range(7):
		part(
			3,
			1,
			Vector3(0, 3.0, -1.5 + plate * 0.43),
			Vector3(0.46, 0.8, 0.55),
			Vector3(-0.4, 0, 0)
		)
	# Curving segmented tail with jade feather finial.
	var last := Vector3(0, 2.0, -1.7)
	for index in range(8):
		var point := Vector3(sin(index * 0.36) * 1.65, 2.0 + index * 0.18, -2.0 - index * 0.39)
		rod(0, last, point, 0.6 - index * 0.05)
		last = point
	part(3, 4, last + Vector3(0, 0.48, 0), Vector3(0.7, 1.25, 0.48), Vector3(0, 0, -0.4))
	finish(parent)


func vehicle(parent: Node3D) -> void:
	# Cedar wind cart: lower hull, bow, seat, brass rails, mast and segmented sail.
	part(1, 3, Vector3(0, 0.52, 0), Vector3(1.7, 0.32, 3.25))
	part(0, 1, Vector3(0, 0.5, -1.5), Vector3(1.65, 0.38, 0.9))
	for side in [-1.0, 1.0]:
		rod(1, Vector3(side * 0.8, 0.9, -1.25), Vector3(side * 0.8, 0.9, 1.3), 0.08)
		for z in [-1.1, 1.1]:
			rod(1, Vector3(side * 0.8, 0.5, z), Vector3(side * 0.8, 0.92, z), 0.07)
			part(
				2, 2, Vector3(side * 1.0, 0.48, z), Vector3(0.96, 0.25, 0.96), Vector3(0, 0, PI / 2)
			)
			part(
				2, 1, Vector3(side * 1.15, 0.48, z), Vector3(0.7, 0.055, 0.7), Vector3(0, 0, PI / 2)
			)
	part(1, 5, Vector3(0, 0.83, 0.2), Vector3(0.8, 0.2, 0.75))
	part(1, 3, Vector3(0, 1.13, 0.55), Vector3(0.85, 0.65, 0.15))
	rod(3, Vector3(0, 0.6, 1.1), Vector3(0, 3.9, 1.1), 0.12)
	rod(1, Vector3(-1.2, 3.65, 1.1), Vector3(1.2, 3.65, 1.1), 0.08)
	for panel in range(5):
		var x := (panel - 2) * 0.44
		part(
			1,
			5,
			Vector3(x, 2.75, 1.12 + absf(x) * 0.22),
			Vector3(0.43, 1.7 - absf(x) * 0.2, 0.05),
			Vector3(0, -x * 0.18, 0)
		)
		rod(
			1,
			Vector3(x, 1.95, 1.12 + absf(x) * 0.22),
			Vector3(x, 3.55, 1.12 + absf(x) * 0.22),
			0.027
		)
	part(0, 0, Vector3(0, 2.8, 1.06), Vector3(0.67, 0.67, 0.06))
	part(0, 1, Vector3(0, 2.8, 1.02), Vector3(0.38, 0.38, 0.06))
	rod(1, Vector3(0, 0.72, -0.6), Vector3(0, 1.3, -0.75), 0.08)
	rod(3, Vector3(-0.4, 1.3, -0.75), Vector3(0.4, 1.3, -0.75), 0.09)
	finish(parent)
