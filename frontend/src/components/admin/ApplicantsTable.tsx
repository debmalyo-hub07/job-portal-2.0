import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { apiClient } from "@/lib/apiClient";
import { getApiErrorMessage } from "@/lib/apiError";
import { useAppSelector } from "@/redux/store";

const shortlistingStatus = ["Accepted", "Rejected"];

const ApplicantsTable = () => {
  const { applicants } = useAppSelector((state) => state.application);

  const statusHandler = async (status: string, id: string) => {
    try {
      const res = await apiClient.post<{ success: boolean; message: string }>(
        `/application/status/${id}/update`,
        { status },
      );
      if (res.data.success) {
        toast.success(res.data.message);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not update status"));
    }
  };

  return (
    <div>
      <Table>
        <TableCaption>A list of your recent applied user</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>FullName</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Resume</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {applicants.map((item) => (
            <TableRow key={item._id}>
              <TableCell>{item.applicant?.fullName}</TableCell>
              <TableCell>{item.applicant?.email}</TableCell>
              <TableCell>{item.applicant?.phone}</TableCell>
              <TableCell>
                {item.applicant?.resume?.storageKey ? (
                  <a
                    className="text-blue-600 cursor-pointer"
                    href={item.applicant.resume.storageKey}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.applicant.resume.originalName ?? "Download"}
                  </a>
                ) : (
                  <span>NA</span>
                )}
              </TableCell>
              <TableCell>{item.applicant?.createdAt?.split("T")[0]}</TableCell>
              <TableCell className="float-right cursor-pointer">
                <Popover>
                  <PopoverTrigger>
                    <MoreHorizontal />
                  </PopoverTrigger>
                  <PopoverContent className="w-32">
                    {shortlistingStatus.map((status) => (
                      <div
                        onClick={() => void statusHandler(status, item._id)}
                        key={status}
                        className="flex w-fit items-center my-2 cursor-pointer"
                      >
                        <span>{status}</span>
                      </div>
                    ))}
                  </PopoverContent>
                </Popover>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default ApplicantsTable;
