/**
 * This hook is used to simulate getting versions from your production backend.
 * It is based on Shotgrid version data.
 */

const VERSION_DATA =
    [
        {
          "type": "Version",
          "id": 4336737,
          "created_at": "2024-04-22T17:11:36-07:00",
          "sg_department": "comp",
          "sg_first_frame": 1001,
          "frame_count": 49,
          "sg_takename": "CG Take",
          "sg_delivery_note": null,
          "entity": {
            "id": 230421,
            "name": "DEMO0020",
            "type": "Shot"
          },
          "sg_task": {
            "id": 2065011,
            "name": "Comp WIP",
            "type": "Task"
          },
          "sg_status_list": "capr",
          "sg_client_version_count": null,
          "description": null,
          "sg_version_task_type": {
            "id": 17058,
            "name": "Composite",
            "type": "CustomEntity03"
          },
          "sg_site": {
            "id": 4,
            "name": "ilm-van",
            "type": "CustomNonProjectEntity02"
          },
          "sg_copy_to_editorial": true,
          "sg_descriptor": null,
          "sg_frame_increment": 1,
          "frame_range": null,
          "updated_at": "2025-09-26T12:25:51-07:00",
          "sg_slate_comment": "\"resubmit for CGCTS-000009\"",
          "sg_movie_has_slate": true,
          "sg_tech_check_status": "na",
          "client_code": null,
          "sg_date_submitted": "2025-08-18T16:00:00-07:00",
          "sg_vendor_version": null,
          "version_sg_reference_for_versions": [],
          "sg_reference_for": [],
          "sg_is_reference": false,
          "sg_submitted_for": null,
          "sg_uploaded_movie_frame_rate": 24.0,
          "sg_delivered": false,
          "sg_delivered_date": null,
          "sg_stereo": false,
          "sg_director_status": null,
          "sg_client_vfx_supe_status": null,
          "sg_studio_status": null,
          "sg_trailer_version": false,
          "sg_showrunner_status": null,
          "tags": [],
          "sg_reason_for_review": null,
          "delivery_sg_versions_deliveries": [],
          "sg_sort_order": 10
        },
        {
          "type": "Version",
          "id": 5190198,
          "created_at": "2024-12-10T18:33:59-08:00",
          "sg_department": "light",
          "sg_first_frame": 10,
          "frame_count": 89,
          "sg_takename": "CG Take",
          "sg_delivery_note": null,
          "entity": {
            "id": 251892,
            "name": "SW0040",
            "type": "Shot"
          },
          "sg_task": {
            "id": 2405111,
            "name": "Lighting",
            "type": "Task"
          },
          "sg_status_list": "apr",
          "sg_client_version_count": null,
          "description": "Improved space battle debris field; need to add rotational movement to larger fragments.",
          "sg_version_task_type": {
            "id": 17048,
            "name": "Lighting",
            "type": "CustomEntity03"
          },
          "sg_site": {
            "id": 5,
            "name": "external",
            "type": "CustomNonProjectEntity02"
          },
          "sg_copy_to_editorial": true,
          "sg_descriptor": null,
          "sg_frame_increment": 1,
          "frame_range": null,
          "updated_at": "2025-09-26T12:25:51-07:00",
          "sg_slate_comment": "cjr095.td.38597.mov",
          "sg_movie_has_slate": true,
          "sg_tech_check_status": "na",
          "client_code": null,
          "sg_date_submitted": "2025-08-10T16:00:00-07:00",
          "sg_vendor_version": null,
          "version_sg_reference_for_versions": [],
          "sg_reference_for": [],
          "sg_is_reference": false,
          "sg_submitted_for": null,
          "sg_uploaded_movie_frame_rate": 24.0,
          "sg_delivered": false,
          "sg_delivered_date": null,
          "sg_stereo": false,
          "sg_director_status": null,
          "sg_client_vfx_supe_status": null,
          "sg_studio_status": null,
          "sg_trailer_version": false,
          "sg_showrunner_status": null,
          "tags": [],
          "sg_reason_for_review": null,
          "delivery_sg_versions_deliveries": [],
          "sg_sort_order": 20
        },
        {
          "type": "Version",
          "id": 5190181,
          "created_at": "2024-12-10T18:30:23-08:00",
          "sg_department": "light",
          "sg_first_frame": 0,
          "frame_count": 134,
          "sg_takename": "CG Take",
          "sg_delivery_note": null,
          "entity": {
            "id": 251890,
            "name": "SW0020",
            "type": "Shot"
          },
          "sg_task": {
            "id": 2405108,
            "name": "Lighting",
            "type": "Task"
          },
          "sg_status_list": "sub",
          "sg_client_version_count": null,
          "description": "Tweaked BB-8\u2019s rolling animation; still need to refine dirt accumulation on sphere surface.",
          "sg_version_task_type": {
            "id": 17048,
            "name": "Lighting",
            "type": "CustomEntity03"
          },
          "sg_site": {
            "id": 5,
            "name": "external",
            "type": "CustomNonProjectEntity02"
          },
          "sg_copy_to_editorial": true,
          "sg_descriptor": null,
          "sg_frame_increment": 1,
          "frame_range": null,
          "updated_at": "2025-09-26T12:25:30-07:00",
          "sg_slate_comment": "ths110.td.35532.mov",
          "sg_movie_has_slate": true,
          "sg_tech_check_status": "na",
          "client_code": null,
          "sg_date_submitted": "2025-08-19T16:00:00-07:00",
          "sg_vendor_version": null,
          "version_sg_reference_for_versions": [],
          "sg_reference_for": [],
          "sg_is_reference": false,
          "sg_submitted_for": null,
          "sg_uploaded_movie_frame_rate": 24.0,
          "sg_delivered": false,
          "sg_delivered_date": null,
          "sg_stereo": false,
          "sg_director_status": null,
          "sg_client_vfx_supe_status": null,
          "sg_studio_status": null,
          "sg_trailer_version": false,
          "sg_showrunner_status": null,
          "tags": [],
          "sg_reason_for_review": null,
          "delivery_sg_versions_deliveries": [],
          "sg_sort_order": 30
        }
      ];


export const useGetVersions = () => {
    return VERSION_DATA.reduce((acc, { id, ...rest }) => {
        acc[id] = rest;
        return acc;
    }, {} as Record<number, Omit<typeof VERSION_DATA[number], 'id'>>);
};