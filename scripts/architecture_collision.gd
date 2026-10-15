extends Node3D
## Flight-safe roof/floor/wall collision from placed base GLBs, never decorative tiles.

const STRUCTURAL_MODULES := [
	"sanctuary",
	"pagoda",
	"pavilion",
	"pavilion_far",
	"gate",
	"shrine",
	"fox_shrine",
	"covered_bridge"
]
var _built := false


func build(world: Node3D) -> void:
	if _built:
		return
	_built = true
	name = "ArchitectureCollision"
	var local_frame := global_transform.affine_inverse()
	for module: Node3D in world.find_children("*", "Node3D", true, false):
		var key := module.scene_file_path.get_file().get_basename()
		if key not in STRUCTURAL_MODULES:
			continue
		var origin := local_frame * module.global_position
		var faces := PackedVector3Array()
		for source: MeshInstance3D in module.find_children("*", "MeshInstance3D", true, false):
			if source.mesh == null:
				continue
			var transform := local_frame * source.global_transform
			for surface in range(source.mesh.get_surface_count()):
				var material := source.mesh.surface_get_material(surface)
				if material == null or not _structural_material(material.resource_name):
					continue
				var arrays := source.mesh.surface_get_arrays(surface)
				var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
				var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
				var count := vertices.size() if indices.is_empty() else indices.size()
				for offset in range(0, count, 3):
					var a := (
						transform * vertices[offset if indices.is_empty() else indices[offset]]
						- origin
					)
					var b := (
						(
							transform
							* vertices[offset + 1 if indices.is_empty() else indices[offset + 1]]
						)
						- origin
					)
					var c := (
						(
							transform
							* vertices[offset + 2 if indices.is_empty() else indices[offset + 2]]
						)
						- origin
					)
					if (b - a).cross(c - a).length_squared() < 0.000000000001:
						continue
					faces.append_array(PackedVector3Array([a, b, c]))
		if faces.is_empty():
			continue
		var body := StaticBody3D.new()
		body.name = key.to_pascal_case() + "Structure"
		body.position = origin
		body.collision_layer = 1
		body.collision_mask = 1
		body.set_meta("source_module", module.scene_file_path)
		var collision := CollisionShape3D.new()
		var shape := ConcavePolygonShape3D.new()
		shape.set_faces(faces)
		shape.backface_collision = true
		collision.shape = shape
		body.add_child(collision)
		add_child(body)


func _structural_material(label: String) -> bool:
	var key := label.get_slice(".", 0).to_lower()
	return (
		key in ["roof", "stone", "timber", "paper", "temple_red_timber", "temple_warm_paper"]
		or "glazed_tiles" in key
		or "pale_stone" in key
	)
