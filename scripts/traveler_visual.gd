extends RefCounted
## Original tailored wanderer, measured in meters. No reference-image pixels.
## All static surfaces batch by shared material; the returned joints animate cloth.

const SEGMENTS := 20
const LANTERN_HIP := Vector3(0.25, 0.88, 0.02)


static func build(model: Node3D) -> Dictionary:
	var palette := materials()
	var fixed := Node3D.new()
	fixed.name = "TailoredAttire"
	model.add_child(fixed)
	build_body(fixed, palette)
	build_head(fixed, palette)
	build_equipment(fixed, palette)
	var mantle := build_mantle(fixed, palette)
	var joints := {"arms": [], "elbows": [], "legs": [], "knees": [], "coat_tails": []}
	for side in [-1.0, 1.0]:
		build_arm(model, side, palette, joints)
		build_leg(model, side, palette, joints)
		build_tail(model, side, palette, joints)
	batch_static(fixed, [mantle])
	model.set_meta("lantern_hip", LANTERN_HIP)
	model.set_meta("original_art", "Temple Realm tailored wanderer v5, MIT")
	return joints


static func materials() -> Dictionary:
	var weave := cloth_texture()
	var result := {}
	for entry in [
		["teal", "17464b", 0.90],
		["ivory", "e1d8bc", 0.94],
		["trouser", "25363d", 0.95],
		["leather", "493a32", 0.86],
		["skin", "bb8769", 0.86],
		["hair", "202422", 0.88],
		["gold", "c4a25a", 0.50],
		["face", "614638", 0.95]
	]:
		var material := StandardMaterial3D.new()
		material.resource_name = "Traveler_" + entry[0]
		material.albedo_color = Color(entry[1])
		material.roughness = entry[2]
		material.cull_mode = BaseMaterial3D.CULL_DISABLED
		if entry[0] in ["teal", "ivory", "trouser", "leather"]:
			material.albedo_texture = weave
			material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
		if entry[0] == "gold":
			material.metallic = 0.42
		result[entry[0]] = material
	return result


static func cloth_texture() -> ImageTexture:
	# Fine woven crossing, occasional warp slubs and a restrained stitched border.
	# One neutral 128px texture serves every cloth/leather color and is mipmapped.
	var image := Image.create(128, 128, false, Image.FORMAT_RGB8)
	for y in range(128):
		for x in range(128):
			var weave := 0.91 + 0.035 * sin(x * PI * 0.5) + 0.025 * cos(y * PI * 0.5)
			weave += 0.018 * sin(x * 0.91 + y * 1.73)
			if x % 32 == 0:
				weave -= 0.035
			image.set_pixel(x, y, Color(weave, weave, weave))
	image.generate_mipmaps()
	return ImageTexture.create_from_image(image)


static func build_body(parent: Node3D, p: Dictionary) -> void:
	# Broad shoulders, narrower waist and a shaped chest replace the capsule torso.
	piece(
		parent,
		rings_mesh(
			[
				Vector3(0.165, 0.79, 0.103),
				Vector3(0.177, 0.96, 0.117),
				Vector3(0.169, 1.08, 0.109),
				Vector3(0.212, 1.27, 0.121),
				Vector3(0.218, 1.34, 0.108),
				Vector3(0.155, 1.39, 0.086)
			],
			24,
			0.004
		),
		p.teal
	)
	# The undershirt and crossed lapels are shaped to the chest rather than boxes.
	ribbon(
		parent,
		[
			Vector3(-0.105, 1.385, -0.10),
			Vector3(-0.06, 1.33, -0.145),
			Vector3(0.02, 1.23, -0.15),
			Vector3(0.13, 1.10, -0.145)
		],
		0.052,
		p.ivory
	)
	ribbon(
		parent,
		[Vector3(0.105, 1.385, -0.10), Vector3(0.06, 1.33, -0.145), Vector3(-0.015, 1.25, -0.154)],
		0.046,
		p.ivory
	)
	ribbon(
		parent,
		[
			Vector3(-0.129, 1.38, -0.10),
			Vector3(-0.084, 1.325, -0.149),
			Vector3(-0.004, 1.225, -0.154),
			Vector3(0.108, 1.095, -0.149)
		],
		0.007,
		p.gold
	)
	ribbon(
		parent,
		[Vector3(0.124, 1.38, -0.10), Vector3(0.079, 1.325, -0.149), Vector3(0.003, 1.245, -0.158)],
		0.007,
		p.gold
	)
	# A wrapped sash has a broad upper edge, soft lower fold and side knot.
	piece(
		parent,
		rings_mesh(
			[
				Vector3(0.198, 0.925, 0.139),
				Vector3(0.198, 0.95, 0.139),
				Vector3(0.188, 1.005, 0.13),
				Vector3(0.184, 1.025, 0.125)
			],
			24
		),
		p.leather
	)
	band(parent, 0.200, 0.141, 0.938, 0.009, p.gold)
	band(parent, 0.187, 0.130, 1.015, 0.008, p.gold)
	ellipsoid(parent, Vector3(-0.198, 0.975, -0.035), Vector3(0.035, 0.045, 0.045), p.teal)
	# A shallow bronze frame and cloth-colored carved center sit on the actual sash.
	ellipsoid(parent, Vector3(0, 0.976, -0.149), Vector3(0.037, 0.028, 0.012), p.gold)
	ellipsoid(parent, Vector3(0, 0.976, -0.161), Vector3(0.023, 0.017, 0.006), p.teal)
	# Back yoke and embroidered cloud/lotus lines stay legible in the player view.
	ribbon(
		parent,
		[Vector3(-0.175, 1.30, 0.111), Vector3(0, 1.23, 0.15), Vector3(0.175, 1.30, 0.111)],
		0.012,
		p.gold
	)
	for side in [-1.0, 1.0]:
		ribbon(
			parent,
			[
				Vector3(0, 1.065, 0.15),
				Vector3(side * 0.055, 1.125, 0.15),
				Vector3(side * 0.075, 1.175, 0.15),
				Vector3(0, 1.14, 0.152)
			],
			0.006,
			p.gold
		)
	# Collar and neck are visible above the tapered shoulder line.
	piece(parent, rings_mesh([Vector3(0.053, 1.36, 0.051), Vector3(0.052, 1.48, 0.05)]), p.skin)
	band(parent, 0.075, 0.066, 1.40, 0.05, p.ivory)
	band(parent, 0.078, 0.068, 1.422, 0.008, p.gold)


static func build_mantle(parent: Node3D, p: Dictionary) -> Node3D:
	var mantle := Node3D.new()
	mantle.name = "ShoulderMantle"
	mantle.position.y = 1.31
	parent.add_child(mantle)
	# A real open-front drape wraps the shoulders; it does not seal the neck or
	# cover the articulated upper arms with a rigid full cylinder.
	var start := -PI * 0.62
	var finish := PI * 0.62
	piece(
		mantle,
		sector_mesh(
			[
				Vector3(0.261, -0.18, 0.168),
				Vector3(0.267, -0.12, 0.171),
				Vector3(0.239, 0.018, 0.142),
				Vector3(0.079, 0.087, 0.075)
			],
			start,
			finish,
			24,
			0.006
		),
		p.ivory
	)
	piece(
		mantle,
		sector_mesh(
			[Vector3(0.263, -0.176, 0.171), Vector3(0.266, -0.161, 0.174)], start, finish, 28, 0.006
		),
		p.gold
	)
	for side in [-1.0, 1.0]:
		ribbon(
			mantle,
			[
				Vector3(side * 0.018, -0.105, 0.177),
				Vector3(side * 0.068, -0.050, 0.174),
				Vector3(side * 0.125, -0.075, 0.165),
				Vector3(side * 0.082, -0.102, 0.179),
				Vector3(side * 0.044, -0.052, 0.173)
			],
			0.006,
			p.gold
		)
	batch_static(mantle)
	return mantle


static func build_head(parent: Node3D, p: Dictionary) -> void:
	# An oval cranium with an actual jaw/chin profile, not a round toy head.
	piece(
		parent,
		rings_mesh(
			[
				Vector3(0.043, 1.445, 0.061),
				Vector3(0.071, 1.465, 0.077),
				Vector3(0.091, 1.51, 0.091),
				Vector3(0.099, 1.565, 0.098),
				Vector3(0.098, 1.62, 0.096),
				Vector3(0.083, 1.67, 0.077),
				Vector3(0.042, 1.69, 0.039),
				Vector3(0.003, 1.693, 0.003)
			],
			24
		),
		p.skin
	)
	# Scalp wraps behind the ears and is open at the face, with carved swept locks.
	piece(
		parent,
		sector_mesh(
			[
				Vector3(0.076, 1.47, 0.079),
				Vector3(0.103, 1.55, 0.105),
				Vector3(0.103, 1.625, 0.102),
				Vector3(0.084, 1.678, 0.079),
				Vector3(0.005, 1.698, 0.005)
			],
			-2.20,
			2.20,
			24,
			0.002
		),
		p.hair
	)
	piece(
		parent,
		rings_mesh(
			[
				Vector3(0.102, 1.65, 0.099),
				Vector3(0.084, 1.683, 0.082),
				Vector3(0.006, 1.707, 0.006)
			],
			24
		),
		p.hair
	)
	ribbon(
		parent,
		[
			Vector3(-0.06, 1.682, -0.074),
			Vector3(-0.022, 1.655, -0.102),
			Vector3(0.01, 1.633, -0.101)
		],
		0.037,
		p.hair
	)
	ribbon(
		parent,
		[
			Vector3(0.058, 1.682, -0.075),
			Vector3(0.068, 1.64, -0.101),
			Vector3(0.078, 1.608, -0.074)
		],
		0.021,
		p.hair
	)
	for side in [-1.0, 1.0]:
		ellipsoid(
			parent, Vector3(side * 0.098, 1.555, -0.002), Vector3(0.017, 0.029, 0.022), p.skin
		)
		# Narrow shaded eye slits and angular eyebrows avoid oversized cartoon dots.
		ribbon(
			parent,
			[Vector3(side * 0.022, 1.579, -0.096), Vector3(side * 0.064, 1.583, -0.077)],
			0.006,
			p.face
		)
		ribbon(
			parent,
			[Vector3(side * 0.024, 1.595, -0.095), Vector3(side * 0.065, 1.599, -0.080)],
			0.006,
			p.hair
		)
	# Small shaped nose, lower lip and tied hair knot.
	ellipsoid(parent, Vector3(0, 1.551, -0.098), Vector3(0.017, 0.028, 0.022), p.skin)
	ribbon(parent, [Vector3(-0.023, 1.508, -0.098), Vector3(0.023, 1.508, -0.098)], 0.004, p.face)
	ellipsoid(parent, Vector3(0, 1.682, 0.082), Vector3(0.057, 0.046, 0.047), p.hair)
	band(parent, 0.045, 0.036, 1.698, 0.013, p.gold, Vector3(0, 0, 0.083))
	for side in [-1.0, 1.0]:
		ribbon(
			parent,
			[
				Vector3(side * 0.012, 1.682, 0.122),
				Vector3(side * 0.045, 1.670, 0.124),
				Vector3(side * 0.026, 1.641, 0.126)
			],
			0.014,
			p.ivory
		)
	var pin := piece(parent, cylinder(0.006, 0.006, 0.167), p.gold, Vector3(0, 1.704, 0.085))
	pin.rotation.z = PI / 2.0


static func build_arm(model: Node3D, side: float, p: Dictionary, joints: Dictionary) -> void:
	var arm := Node3D.new()
	arm.name = "ArmLeft" if side < 0 else "ArmRight"
	arm.position = Vector3(side * 0.218, 1.325, 0)
	model.add_child(arm)
	joints.arms.append(arm)
	piece(
		arm,
		rings_mesh(
			[
				Vector3(0.068, -0.25, 0.068),
				Vector3(0.078, -0.20, 0.078),
				Vector3(0.091, -0.08, 0.092),
				Vector3(0.083, 0.015, 0.085),
				Vector3(0.025, 0.035, 0.027)
			],
			16,
			0.003
		),
		p.ivory
	)
	band(arm, 0.078, 0.079, -0.238, 0.032, p.teal)
	var elbow := Node3D.new()
	elbow.name = "Elbow"
	elbow.position.y = -0.235
	arm.add_child(elbow)
	joints.elbows.append(elbow)
	piece(
		elbow,
		rings_mesh(
			[
				Vector3(0.041, -0.205, 0.045),
				Vector3(0.058, -0.14, 0.059),
				Vector3(0.061, -0.07, 0.062),
				Vector3(0.058, 0.01, 0.058)
			],
			16,
			0.002
		),
		p.teal
	)
	band(elbow, 0.049, 0.051, -0.175, 0.045, p.leather)
	band(elbow, 0.05, 0.052, -0.158, 0.006, p.gold)
	for index in range(3):
		var y := -0.145 - index * 0.014
		ribbon(
			elbow, [Vector3(-0.035, y, -0.050), Vector3(0.035, y - 0.022, -0.050)], 0.004, p.gold
		)
	# A tapered palm and four relaxed fingers replace the mitten silhouette.
	ellipsoid(elbow, Vector3(0, -0.226, -0.009), Vector3(0.031, 0.037, 0.021), p.skin)
	for finger in range(4):
		var digit := SphereMesh.new()
		digit.radius = 1.0
		digit.height = 2.0
		digit.radial_segments = 8
		digit.rings = 4
		var length := 0.022 if finger in [0, 3] else 0.028
		var hand := piece(
			elbow, digit, p.skin, Vector3((finger - 1.5) * 0.014, -0.257 - length * 0.5, -0.013)
		)
		hand.scale = Vector3(0.008, length, 0.010)
		hand.rotation.x = 0.18 + finger * 0.04
	ellipsoid(elbow, Vector3(-side * 0.029, -0.22, -0.017), Vector3(0.012, 0.031, 0.016), p.skin)
	batch_static(arm, [elbow])
	batch_static(elbow)


static func build_leg(model: Node3D, side: float, p: Dictionary, joints: Dictionary) -> void:
	var leg := Node3D.new()
	leg.name = "LegLeft" if side < 0 else "LegRight"
	leg.position = Vector3(side * 0.098, 0.79, 0)
	model.add_child(leg)
	joints.legs.append(leg)
	piece(
		leg,
		rings_mesh(
			[
				Vector3(0.062, -0.365, 0.071),
				Vector3(0.073, -0.26, 0.083),
				Vector3(0.084, -0.10, 0.093),
				Vector3(0.084, 0.02, 0.088)
			],
			16,
			0.003
		),
		p.trouser
	)
	var knee := Node3D.new()
	knee.name = "Knee"
	knee.position.y = -0.36
	leg.add_child(knee)
	joints.knees.append(knee)
	piece(
		knee,
		rings_mesh(
			[
				Vector3(0.047, -0.34, 0.063),
				Vector3(0.051, -0.27, 0.062),
				Vector3(0.064, -0.15, 0.075),
				Vector3(0.062, -0.02, 0.070),
				Vector3(0.058, 0.02, 0.064)
			],
			16
		),
		p.leather
	)
	band(knee, 0.064, 0.073, -0.028, 0.032, p.teal)
	band(knee, 0.065, 0.074, -0.013, 0.006, p.gold)
	# Closed, flattened toe and raised instep retain a boot silhouette on stairs.
	var toe := ellipsoid(knee, Vector3(0, -0.365, -0.043), Vector3(0.058, 0.044, 0.111), p.leather)
	toe.rotation.x = -0.07
	ribbon(knee, [Vector3(0, -0.32, -0.071), Vector3(0, -0.36, -0.14)], 0.009, p.gold)
	batch_static(knee)


static func build_tail(model: Node3D, side: float, p: Dictionary, joints: Dictionary) -> void:
	var tail := Node3D.new()
	tail.name = "CoatLeft" if side < 0 else "CoatRight"
	tail.position = Vector3(side * 0.10, 0.97, 0)
	model.add_child(tail)
	joints.coat_tails.append(tail)
	# Each open side panel spans side/back and leaves a true center walking split.
	var start := -PI + 0.13 if side < 0 else -0.13
	var finish := 0.13 if side < 0 else PI - 0.13
	var cloth := sector_mesh(
		[
			Vector3(0.265, -0.59, 0.18),
			Vector3(0.248, -0.54, 0.171),
			Vector3(0.223, -0.35, 0.155),
			Vector3(0.19, -0.10, 0.126),
			Vector3(0.18, 0.0, 0.12)
		],
		start,
		finish,
		16,
		0.011
	)
	var coat := piece(tail, cloth, p.teal, Vector3(-side * 0.10, 0, 0))
	coat.set_meta("cloth", true)
	piece(
		tail,
		sector_mesh(
			[Vector3(0.267, -0.582, 0.182), Vector3(0.262, -0.56, 0.179)], start, finish, 24, 0.011
		),
		p.gold,
		Vector3(-side * 0.10, 0, 0)
	)
	# The ivory inner skirt is visible only at the front opening and during stride.
	piece(
		tail,
		sector_mesh(
			[Vector3(0.204, -0.54, 0.147), Vector3(0.164, -0.02, 0.112)],
			PI * 0.55 if side > 0 else -PI * 0.96,
			PI * 0.96 if side > 0 else -PI * 0.55,
			8,
			0.008
		),
		p.ivory,
		Vector3(-side * 0.10, 0, 0)
	)
	# Gold cloud curls remain attached to each moving coat panel.
	ribbon(
		tail,
		[
			Vector3(side * 0.025, -0.43, 0.163),
			Vector3(side * 0.075, -0.39, 0.159),
			Vector3(side * 0.115, -0.42, 0.151),
			Vector3(side * 0.070, -0.455, 0.169)
		],
		0.007,
		p.gold
	)
	batch_static(tail)


static func build_equipment(parent: Node3D, p: Dictionary) -> void:
	# Narrow cross-body strap and hip satchel replace a conspicuous rectangular pack.
	for z_sign in [-1.0, 1.0]:
		ribbon(
			parent,
			[
				Vector3(0.15, 1.34, z_sign * 0.103),
				Vector3(0.02, 1.18, z_sign * 0.142),
				Vector3(-0.17, 0.99, z_sign * 0.134)
			],
			0.033,
			p.leather
		)
	var bag := piece(
		parent,
		rings_mesh(
			[
				Vector3(0.059, -0.105, 0.035),
				Vector3(0.093, -0.08, 0.047),
				Vector3(0.094, 0.05, 0.046),
				Vector3(0.077, 0.08, 0.035),
				Vector3(0.005, 0.085, 0.005)
			],
			16
		),
		p.leather,
		Vector3(-0.235, 0.88, 0.045)
	)
	bag.rotation.z = -0.10
	ellipsoid(parent, Vector3(-0.236, 0.90, 0.096), Vector3(0.013, 0.013, 0.006), p.gold)
	# The jian sits diagonally along the back, away from the lantern's right hip.
	var sword := Node3D.new()
	sword.position = Vector3(0.025, 1.08, 0.154)
	sword.rotation.z = -0.42
	parent.add_child(sword)
	piece(
		sword,
		rings_mesh(
			[
				Vector3(0.013, -0.48, 0.012),
				Vector3(0.026, -0.43, 0.017),
				Vector3(0.029, 0.25, 0.019)
			],
			8
		),
		p.teal
	)
	for y in [-0.42, 0.21]:
		band(sword, 0.029, 0.020, y, 0.025, p.gold)
	var guard := ellipsoid(sword, Vector3(0, 0.275, 0), Vector3(0.076, 0.019, 0.028), p.gold)
	guard.rotation.z = -0.1
	piece(sword, cylinder(0.018, 0.019, 0.14), p.leather, Vector3(0, 0.36, 0))
	for y in [0.313, 0.342, 0.371, 0.400]:
		band(sword, 0.02, 0.02, y, 0.006, p.gold)
	ellipsoid(sword, Vector3(0, 0.442, 0), Vector3(0.025, 0.023, 0.022), p.gold)
	# A narrow cloth tie creates a softer outline without another physics object.
	ribbon(
		parent,
		[Vector3(-0.18, 0.97, -0.06), Vector3(-0.23, 0.82, -0.08), Vector3(-0.20, 0.66, -0.12)],
		0.036,
		p.ivory
	)


static func rings_mesh(rings: Array[Vector3], segments := SEGMENTS, pleat := 0.0) -> ArrayMesh:
	return sector_mesh(rings, 0.0, TAU, segments, pleat)


static func sector_mesh(
	rings: Array[Vector3], start: float, finish: float, segments: int, pleat := 0.0
) -> ArrayMesh:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for row in range(rings.size() - 1):
		for column in range(segments):
			for coordinate in [
				Vector2i(row, column),
				Vector2i(row + 1, column),
				Vector2i(row + 1, column + 1),
				Vector2i(row, column),
				Vector2i(row + 1, column + 1),
				Vector2i(row, column + 1)
			]:
				var ring := rings[coordinate.x]
				var u := float(coordinate.y) / segments
				var theta := lerpf(start, finish, u)
				var wave := sin(theta * 12.0) * pleat
				var previous := rings[maxi(0, coordinate.x - 1)]
				var next := rings[mini(rings.size() - 1, coordinate.x + 1)]
				var slope := (next.x - previous.x) / maxf(0.001, next.y - previous.y)
				surface.set_normal(Vector3(sin(theta), -slope, cos(theta)).normalized())
				surface.set_uv(Vector2(u * 2.0, ring.y * 3.0))
				surface.add_vertex(
					Vector3(sin(theta) * (ring.x + wave), ring.y, cos(theta) * (ring.z + wave))
				)
	surface.index()
	return surface.commit()


static func ribbon(parent: Node3D, points: Array[Vector3], width: float, mat: Material) -> void:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in range(points.size() - 1):
		var tangent := (points[i + 1] - points[i]).normalized()
		var across := Vector3(-tangent.y, tangent.x, 0) * width * 0.5
		var normal := Vector3(0, 0, -1 if points[i].z < 0 else 1)
		var vertices := [
			points[i] - across, points[i] + across, points[i + 1] + across, points[i + 1] - across
		]
		var order := [0, 1, 2, 0, 2, 3] if normal.z < 0 else [0, 2, 1, 0, 3, 2]
		for index in order:
			surface.set_normal(normal)
			surface.set_uv(Vector2(float(index % 2), float(i)))
			surface.add_vertex(vertices[index])
	surface.index()
	piece(parent, surface.commit(), mat)


static func piece(
	parent: Node3D, mesh: Mesh, material: Material, at := Vector3.ZERO
) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.material_override = material
	node.position = at
	parent.add_child(node)
	return node


static func ellipsoid(
	parent: Node3D, at: Vector3, size: Vector3, material: Material
) -> MeshInstance3D:
	var sphere := SphereMesh.new()
	sphere.radius = 1.0
	sphere.height = 2.0
	sphere.radial_segments = 16
	sphere.rings = 8
	var node := piece(parent, sphere, material, at)
	node.scale = size
	return node


static func cylinder(top: float, bottom: float, height: float) -> CylinderMesh:
	var mesh := CylinderMesh.new()
	mesh.top_radius = top
	mesh.bottom_radius = bottom
	mesh.height = height
	mesh.radial_segments = 12
	return mesh


static func band(
	parent: Node3D,
	x: float,
	z: float,
	y: float,
	height: float,
	material: Material,
	offset := Vector3.ZERO
) -> void:
	piece(
		parent,
		rings_mesh([Vector3(x, y - height / 2.0, z), Vector3(x, y + height / 2.0, z)], 20),
		material,
		offset
	)


static func batch_static(parent: Node3D, exclusions: Array[Node3D] = []) -> void:
	var batches := {}
	collect_meshes(parent, Transform3D.IDENTITY, exclusions, batches)
	for child in parent.get_children():
		if child not in exclusions:
			parent.remove_child(child)
			child.free()
	for key in batches:
		var batch: Dictionary = batches[key]
		var surface := SurfaceTool.new()
		surface.begin(Mesh.PRIMITIVE_TRIANGLES)
		for entry in batch.entries:
			surface.append_from(entry.mesh, 0, entry.transform)
		var combined := piece(parent, surface.commit(), batch.material)
		combined.name = "Cloth_" + batch.material.resource_name


static func collect_meshes(
	parent: Node3D, transform: Transform3D, exclusions: Array[Node3D], batches: Dictionary
) -> void:
	for child in parent.get_children():
		if child in exclusions or not child is Node3D:
			continue
		var at: Transform3D = transform * child.transform
		if child is MeshInstance3D:
			var key: int = child.material_override.get_instance_id()
			if not batches.has(key):
				batches[key] = {"material": child.material_override, "entries": []}
			batches[key].entries.append({"mesh": child.mesh, "transform": at})
		collect_meshes(child, at, exclusions, batches)
