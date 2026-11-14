def require_all_response_fields(result, generator, request, public):
    """Mark every field of a response schema as required.

    drf-spectacular only lists a field as required in a response if it is required on input.
    Fields like `description` or `due_date` (optional to send) would come out as optional to
    receive, and the generated TypeScript would force needless undefined checks. The API always
    returns every field, so the schema should say so.
    """
    schemas = result.get("components", {}).get("schemas", {})
    for name, schema in schemas.items():
        if name.endswith("Request"):  # request bodies keep their real required/optional split
            continue
        properties = schema.get("properties")
        if not properties:
            continue
        required = [key for key, spec in properties.items() if not spec.get("writeOnly")]
        if required:
            schema["required"] = required
    return result