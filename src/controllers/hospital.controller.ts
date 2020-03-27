import { IController } from "../shared/interfaces";
import { Router, Request, Response, NextFunction, response } from "express";
import { HospitalService } from "../services/hospital.service";
import HttpException from "../shared/exceptions/httpException";
import { CRequest, CResponse } from "../shared/interfaces/http.interface";
import validateHospital from "../request_validations/hospital.validation";
// @ts-ignore: Resolve json module
import hospitalJson from "../../hospitaldata.json"
import { prepareJsonFileImport, prepareJsonFileUpdate } from "../services/hospitalExcel.service"
import { query } from "winston";

export class HospitalController implements IController {
    route: string = "hospitals"
    router: Router;

    constructor(private hospitalService: HospitalService) {
        this.router = Router();
        this.initRoutes();
    }

    initRoutes() {
        this.router.post("/", this.createHospital);
        this.router.post("/import-json/:rows/:remove", this.importHospitalFromJsonFile);
        this.router.put("/import-json/update", this.updateHospitalFromJsonFile);
        this.router.get("/", this.getAllHospitals);
        this.router.get("/covid", this.getHospitalsForCovid);
        this.router.get("/:nameSlug", this.getHospitalBySlug);
        this.router.get("/id/:id", this.getHospitalById);
        this.router.put("/:id", validateHospital, this.updateHospital);
        // this.router.patch(":/id", validateHospital, this.updateHospital)
        this.router.delete("/:id", this.removeHospital);
    }

    getHospitalById = async (request: CRequest, response: CResponse) => {

        try {
            const result = await this.hospitalService.getHospitalById(request.params.id);
            response.status(200).json(result);
        } catch (error) {
            error = new HttpException({
                statusCode: 500,
                description: error.message,
            })
            const parsedError = error.parse()
            response.status(parsedError.statusCode).json(parsedError)
            response.status(500).json({ error })
        }
    }

    createHospital = async (request: CRequest, response: CResponse) => {
        try {
            const hospitalData = request.body;
            const hospital = await this.hospitalService.createHospital(hospitalData);

            response.status(201).json(hospital);
        } catch (error) {
            error = new HttpException({
                statusCode: 500,
                description: error.message,
            })
            const parsedError = error.parse()
            response.status(parsedError.statusCode).json(parsedError)
            response.status(500).json({ error })
        }
    }

    importHospitalFromJsonFile = async (request: CRequest, response: CResponse) => {
        let insertAll = false;
        let removeAll = false;
        let from, to;

        if (request.params.rows === "all") {
            insertAll = true;

            // remove all and insert all again
            if (request.params.remove == "true") {
                removeAll = true;   
            }

        } else {
            const rows = request.params.rows.split('-');
            from = Number(rows[0]);
            to = Number(rows[1]);
        }

        let records: any = prepareJsonFileImport({
            data: hospitalJson,
            query: {
                insertAll,
                from,
                to
            }
        })

        // inserting data
        if (records.length) {

            // removing all hospital records
            if (removeAll) {
                global.logger.log({ level: 'info', message: 'Removing all hospital records'})
                await this.hospitalService.deleteAll();
            }

            for (let record of records) {
                await this.hospitalService.createHospital(record);
            }
        }

        response.send("Data load completed");
    }

    updateHospitalFromJsonFile = async (request: CRequest, response: CResponse) => {
        let updateRecords = prepareJsonFileUpdate({
            data: hospitalJson
        });

        const records = updateRecords.data;
        const updatedSerialNumbers = updateRecords.sn;

        // updaing data
        if (records.length) {
            for (let record of records) {
                const deletedHospital: any = await this.hospitalService.deleteHospitalBySlug(record.nameSlug);
                if (deletedHospital != null) {
                    global.logger.log({
                        level: "info",
                        message: `Deleted hospital -> ${deletedHospital.name}`
                    });
                }

                await this.hospitalService.createHospital(record);
            }

            response.json({
                message: `Hospitals updated successfully`,
                updatedSerialNumbers
            });
        }
        else {
            response.send("There are no data to update from json.")
        }
    }

    updateHospital = async (request: CRequest, response: CResponse) => {
        try {
            global.logger.log({
                level: 'info',
                message: `Updaing hospital->id:${request.params.id}, body: ${JSON.stringify(request.body)}`
            });

            const result = await this.hospitalService.update(request.params.id, request.body);
            return response.json(result);
        } catch (error) {
            error = new HttpException({
                statusCode: 500,
                description: error.message,
            })
            const parsedError = error.parse()
            response.status(parsedError.statusCode).json(parsedError)
        }
    }

    removeHospital = async (request: CRequest, response: CResponse) => {
        try {
            global.logger.log({
                level: 'info',
                message: `Deleting hospital->id:${request.params.id}`
            });

            const result: any = await this.hospitalService.delete(request.params.id);
            if (result === null) {
                return response.status(500).json({
                    error: "Unable to delete hospital record"
                })
            }

            return response.json({
                message: `'${result.name || ""}' removed successfully.`
            });
        } catch (error) {
            error = new HttpException({
                statusCode: 500,
                description: error.message,
            })
            const parsedError = error.parse()
            response.status(parsedError.statusCode).json(parsedError)
        }
    }


    getAllHospitals = async (request: CRequest, response: CResponse) => {
        try {
            const result = await this.hospitalService.getHospitals(request.query);
            response.status(200).json(result)
        } catch (error) {
            error = new HttpException({
                statusCode: 500,
                description: error.message,
            })
            const parsedError = error.parse()
            response.status(parsedError.statusCode).json(parsedError)
            response.status(500).json({ error })
        }
    }

    getHospitalsForCovid = async (request: CRequest, response: CResponse) => {
        try {
            const docs = await this.hospitalService.getCovidHospitals();
            response.status(200).json({ docs })
        } catch (error) {
            error = new HttpException({
                statusCode: 500,
                description: error.message,
            })
            const parsedError = error.parse()
            response.status(parsedError.statusCode).json(parsedError)
            response.status(500).json({ error })
        }
    }

    getHospitalBySlug = async (request: CRequest, response: CResponse) => {
        try {
            const nameSlug = request.params.nameSlug;
            const hospitals = await this.hospitalService.getHospitalBySlug(nameSlug);
            response.status(200).json(hospitals[0]);
        } catch (error) {
            error = new HttpException({
                statusCode: 500,
                description: error.message,
            })
            const parsedError = error.parse()
            response.status(parsedError.statusCode).json(parsedError)
            response.status(500).json({ error })
        }
    }
}
